import {
  DebugBreakpointPathSchema,DebugBreakpointSetSchema,DebugBreakpointRemoveSchema,
  DebuggerInfoResultSchema,DebuggerBreakpointApplyResultSchema,DebuggerBreakpointRemoveBridgeResultSchema,DebuggerBreakpointSnapshotSchema,DebugControlResultSchema,
  MAX_DEBUG_VALUE_CHARS,DEFAULT_DEBUG_VARIABLE_PAGE,
  type BridgeRuntimeEvent,type RuntimeStatus,type DebugBreakpoint,type DebugBreakpointSetParams,type DebugBreakpointRemoveParams,
  type DebugBreakpointSetResult,type DebugBreakpointRemoveResult,type DebugBreakpointListResult,type DebugStackResult,type DebugVariablesParams,type DebuggerInfoResult,
  type DebugVariablesResult,type DebugExpandParams,type DebugExpandResult,type DebugVariable,type DebugControlAction,type DebugControlResult
} from '@godot-mcp/protocol';
import type {Session} from '../session/session.js';
import {BridgeRpcError,type RpcRouter} from '../bridge/rpc-router.js';
import {DebugReferenceStore} from './debug-reference-store.js';
import {DapRequestError,TcpDapTransport,type DapEvent,type DapTransport} from './dap-transport.js';

type DebuggerState='DETACHED'|'ATTACHING'|'READY'|'BREAKED'|'RESUMING'|'UNAVAILABLE';
const GODOT_MAIN_DEBUG_THREAD_ID=1;
const GODOT_SCOPE_VARIABLE_RETRY_DELAY_MS=25;
const GODOT_SCOPE_VARIABLE_RETRY_LIMIT=40;
type DapTransportFactory=()=>DapTransport;
interface RuntimeObserver {peek():RuntimeStatus;subscribe(listener:(status:RuntimeStatus)=>void):()=>void;}
interface DebuggerBridge {connected:boolean;rpc:Pick<RpcRouter,'call'>;}
interface InitializedWaiter {resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>;transport:DapTransport;}

export class DebuggerService {
  private state:DebuggerState='DETACHED';
  private transport:DapTransport|null=null;
  private attachedRunId:string|null=null;
  private observedRunId:string|null=null;
  private pendingStoppedThreadId:number|null=null;
  private stoppedThreadId:number|null=null;
  private attachPromise:Promise<void>|null=null;
  private initializedWaiter:InitializedWaiter|null=null;
  private controlBusy=false;
  private unavailableReason:string|null=null;
  private closed=false;
  private readonly refs=new DebugReferenceStore();
  private readonly ownedBreakpoints=new Map<string,DebugBreakpoint>();
  private readonly unsubscribeRuntime:()=>void;

  constructor(
    private readonly session:Session,
    private readonly runtime:RuntimeObserver,
    private readonly bridge:DebuggerBridge,
    private readonly transportFactory:DapTransportFactory=()=>new TcpDapTransport()
  ){
    this.unsubscribeRuntime=this.runtime.subscribe(status=>this.onRuntimeStatus(status));
  }

  async editorConnected():Promise<void>{
    this.assertOpen();
    if(!this.bridge.connected)throw new BridgeRpcError('EDITOR_NOT_CONNECTED','Editor is not connected');
    if(this.state==='UNAVAILABLE'){this.state='DETACHED';this.unavailableReason=null;}
    await this.reconcileOwnedBreakpoints();
    const status=this.runtime.peek();
    if(this.isActiveOwned(status))await this.ensureAttached();
  }

  editorDisconnected():void{
    this.detachTransport();
    this.invalidateBreakContext();
    this.state='DETACHED';
  }

  acceptBridgeEvent(event:BridgeRuntimeEvent):void{
    if(event.sessionId!==this.session.id||event.event!=='debugger.breakpoints')return;
    let snapshot;
    try{snapshot=DebuggerBreakpointSnapshotSchema.parse(event.data);}catch{throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','Malformed debugger breakpoint snapshot');}
    const physical=new Set(snapshot.breakpoints.map(value=>this.breakpointKey(value.scriptPath,value.line)));
    for(const [key] of this.ownedBreakpoints){if(!physical.has(key))this.ownedBreakpoints.delete(key);}
  }

  async setBreakpoint(input:DebugBreakpointSetParams):Promise<DebugBreakpointSetResult>{
    this.requireEditor();const parsed=DebugBreakpointSetSchema.parse(input);const key=this.breakpointKey(parsed.script_path,parsed.line);
    const existing=this.ownedBreakpoints.get(key);
    const info=await this.readDebuggerInfo();
    if(existing){
      return {scriptPath:existing.scriptPath,line:existing.line,owned:true,applied:this.containsBreakpoint(info.breakpoints,existing)};
    }
    const candidate={scriptPath:parsed.script_path,line:parsed.line};
    const mirrorProvesOwnership=info.breakpointOwnerSessionId===this.session.id&&this.containsBreakpoint(info.mcpBreakpoints,candidate);
    if(mirrorProvesOwnership){
      this.ownedBreakpoints.set(key,candidate);
      return {scriptPath:candidate.scriptPath,line:candidate.line,owned:true,applied:this.containsBreakpoint(info.breakpoints,candidate)};
    }
    if(this.containsBreakpoint(info.breakpoints,candidate))throw new BridgeRpcError('BREAKPOINT_OWNERSHIP_CONFLICT','Breakpoint already exists outside MCP ownership');
    this.ownedBreakpoints.set(key,candidate);
    try{
      const raw=await this.bridge.rpc.call('debugger.breakpoint.set',{script_path:parsed.script_path,line:parsed.line});
      const result=this.parseBridge(DebuggerBreakpointApplyResultSchema,raw,'breakpoint apply');
      return {scriptPath:result.scriptPath,line:result.line,owned:true,applied:result.applied};
    }catch(error){
      this.ownedBreakpoints.delete(key);
      if(error instanceof BridgeRpcError&&['BREAKPOINT_OWNERSHIP_CONFLICT','BREAKPOINT_INVALID_PATH','BREAKPOINT_INVALID_LINE','DEBUG_PROTOCOL_ERROR'].includes(error.code))throw error;
      throw new BridgeRpcError('BREAKPOINT_APPLY_FAILED','Unable to apply MCP breakpoint');
    }
  }

  async removeBreakpoint(input:DebugBreakpointRemoveParams):Promise<DebugBreakpointRemoveResult>{
    this.requireEditor();const parsed=DebugBreakpointRemoveSchema.parse(input);const key=this.breakpointKey(parsed.script_path,parsed.line);
    if(!this.ownedBreakpoints.has(key))throw new BridgeRpcError('BREAKPOINT_NOT_OWNED','Breakpoint is not owned by this MCP session');
    const raw=await this.bridge.rpc.call('debugger.breakpoint.remove',{script_path:parsed.script_path,line:parsed.line});
    const result=this.parseBridge(DebuggerBreakpointRemoveBridgeResultSchema,raw,'breakpoint remove');
    this.ownedBreakpoints.delete(key);
    return {scriptPath:result.scriptPath,line:result.line,removed:true};
  }

  async listBreakpoints():Promise<DebugBreakpointListResult>{
    this.requireEditor();
    return {scope:'session_owned',breakpoints:[...this.ownedBreakpoints.values()].sort((a,b)=>a.scriptPath.localeCompare(b.scriptPath)||a.line-b.line)};
  }

  async stack():Promise<DebugStackResult>{
    const context=this.requireBreakContext();const generation=this.captureGeneration();const transport=this.transport!;
    const body=await transport.request('stackTrace',{threadId:context.threadId},5000);this.assertGeneration(generation);
    const frames=body.stackFrames;if(!Array.isArray(frames))throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP stackTrace response is malformed');
    const mapped=frames.slice(0,1024).map(frame=>{
      if(!frame||typeof frame!=='object'||Array.isArray(frame))throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP stack frame is malformed');
      const value=frame as Record<string,unknown>;const backendId=this.requiredInteger(value.id,'stack frame id',0);
      const name=typeof value.name==='string'?value.name.slice(0,1024):'';
      const line=this.requiredInteger(value.line,'stack frame line',1);
      // Godot 4.6.3 currently reports stack frame column=0 (unknown) even
      // when the DAP client requests 1-based columns. Keep the public MCP
      // contract 1-based by normalizing only that documented adapter sentinel.
      const rawColumn=value.column===undefined?1:this.requiredInteger(value.column,'stack frame column',0);const column=rawColumn===0?1:rawColumn;
      const source=value.source;if(!source||typeof source!=='object'||Array.isArray(source)||typeof (source as Record<string,unknown>).path!=='string')throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP stack frame source is missing');
      const scriptPath=this.normalizeSourcePath((source as Record<string,unknown>).path as string);
      return {frameId:this.refs.createFrameRef(backendId),name,scriptPath,line,column};
    });
    return {breakId:context.breakId,frames:mapped};
  }

  async variables(input:DebugVariablesParams):Promise<DebugVariablesResult>{
    const context=this.requireBreakContext();const generation=this.captureGeneration();const backendFrame=this.refs.resolveFrameRef(input.frame_id);const transport=this.transport!;
    const body=await transport.request('scopes',{frameId:backendFrame},5000);this.assertGeneration(generation);
    if(!Array.isArray(body.scopes))throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP scopes response is malformed');
    const scopes=[] as DebugVariablesResult['scopes'];
    for(const rawScope of body.scopes.slice(0,64)){
      if(!rawScope||typeof rawScope!=='object'||Array.isArray(rawScope))throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP scope is malformed');
      const scope=rawScope as Record<string,unknown>;const name=typeof scope.name==='string'?scope.name.slice(0,1024):'';const reference=this.requiredInteger(scope.variablesReference,'scope variablesReference',1);
      const varsBody=await this.requestScopeVariables(transport,reference,generation);
      scopes.push({name,variables:this.mapVariables(varsBody,DEFAULT_DEBUG_VARIABLE_PAGE)});
    }
    return {frameId:input.frame_id,scopes};
  }

  async expand(input:DebugExpandParams):Promise<DebugExpandResult>{
    this.requireBreakContext();const generation=this.captureGeneration();const backendReference=this.refs.resolveVariableRef(input.variable_ref);const transport=this.transport!;
    const body=await transport.request('variables',{variablesReference:backendReference,start:input.start,count:input.limit},5000);this.assertGeneration(generation);
    const entries=this.mapVariables(body,input.limit);
    return {variableRef:input.variable_ref,start:input.start,entries,nextCursor:entries.length===input.limit?input.start+entries.length:null};
  }

  continueExecution():Promise<DebugControlResult>{return this.control('continue','continue');}
  stepInto():Promise<DebugControlResult>{return this.control('step_into','stepIn');}
  stepOver():Promise<DebugControlResult>{return this.control('step_over','next');}
  stepOut():Promise<DebugControlResult>{return this.controlViaBridge('step_out','debugger.step_out');}

  async close():Promise<void>{
    if(this.closed)return;this.closed=true;this.unsubscribeRuntime();
    const failures:Error[]=[];const owned=[...this.ownedBreakpoints.values()];
    if(this.bridge.connected){
      for(const breakpoint of owned){
        try{
          const raw=await this.bridge.rpc.call('debugger.breakpoint.remove',{script_path:breakpoint.scriptPath,line:breakpoint.line});
          this.parseBridge(DebuggerBreakpointRemoveBridgeResultSchema,raw,'breakpoint cleanup');
        }catch(error){failures.push(error instanceof Error?error:new Error(String(error)));}
      }
    }
    this.ownedBreakpoints.clear();this.detachTransport();this.invalidateBreakContext();this.state='DETACHED';
    if(failures.length)throw failures[0];
  }

  private onRuntimeStatus(status:RuntimeStatus):void{
    if(this.closed)return;
    const runChanged=status.runId!==this.observedRunId;
    if(runChanged){
      this.observedRunId=status.runId;this.detachTransport();this.refs.resetRuntime();this.pendingStoppedThreadId=null;this.stoppedThreadId=null;this.unavailableReason=null;this.state='DETACHED';
    }
    if(!this.isActiveOwned(status)){
      if(status.ownership!=='session'||['stopped','failed','disconnected','stopping'].includes(status.state)){
        this.detachTransport();this.invalidateBreakContext();this.state='DETACHED';
      }
      return;
    }
    if(status.state==='breaked')this.maybeEstablishBreak();
    else if(this.state==='BREAKED'||this.state==='RESUMING'){
      if(this.state==='BREAKED')this.invalidateBreakContext();
      if(this.transport)this.state='READY';
    }
    if(this.bridge.connected&&this.state==='DETACHED')void this.ensureAttached().catch(()=>{});
  }

  private isActiveOwned(status:RuntimeStatus):boolean{
    return status.ownership==='session'&&status.runId!==null&&['running','paused','breaked'].includes(status.state);
  }

  private async ensureAttached():Promise<void>{
    const status=this.runtime.peek();
    if(!this.isActiveOwned(status))return;
    if(!this.bridge.connected)throw new BridgeRpcError('DEBUGGER_UNAVAILABLE','Editor debugger bridge is unavailable');
    if(this.transport&&this.attachedRunId===status.runId&&['READY','BREAKED','RESUMING'].includes(this.state))return;
    if(this.state==='UNAVAILABLE')throw new BridgeRpcError('DEBUGGER_UNAVAILABLE',this.unavailableReason??'Debugger is unavailable for the current runtime generation');
    if(this.attachPromise){await this.attachPromise;return;}
    const promise=this.attachToRun(status.runId!);this.attachPromise=promise;
    try{await promise;}finally{if(this.attachPromise===promise)this.attachPromise=null;}
  }

  private async attachToRun(runId:string):Promise<void>{
    this.state='ATTACHING';
    let info:DebuggerInfoResult;
    try{info=await this.readDebuggerInfo();}catch(error){
      this.state=this.bridge.connected?'UNAVAILABLE':'DETACHED';
      throw error;
    }
    let transport:DapTransport|null=null;let lastError:unknown=null;
    for(let attempt=0;attempt<20;attempt++){
      const candidate=this.transportFactory();
      try{await candidate.connect(info.dapHost,info.dapPort,500);transport=candidate;break;}catch(error){
        lastError=error;candidate.close();const code=(error as NodeJS.ErrnoException|undefined)?.code;
        if(code!=='ECONNREFUSED'||attempt===19)break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    }
    if(!transport){this.state='UNAVAILABLE';this.unavailableReason=lastError instanceof Error?lastError.message:'Unable to connect to Godot DAP';throw new BridgeRpcError('DEBUGGER_ATTACH_FAILED',`Unable to connect to Godot DAP${lastError instanceof Error?`: ${lastError.message}`:''}`);}
    const current=this.runtime.peek();
    if(current.runId!==runId||current.ownership!=='session'){transport.close();this.state='DETACHED';throw new BridgeRpcError('RUNTIME_NOT_OWNED','Runtime changed during debugger attach');}
    this.transport=transport;this.attachedRunId=runId;
    transport.onEvent(event=>{if(this.transport===transport)this.onDapEvent(event);});
    transport.onClose(error=>{if(this.transport===transport)this.onUnexpectedTransportClose(transport,error);});
    try{
      await this.withDapBreakpointSync(async()=>{
        // Godot 4.6.3 emits `initialized` while it is still servicing the
        // initialize request. Install the waiter first or the event can be lost
        // before the initialize promise resumes.
        const initialized=this.waitForInitialized(transport,5000);
        const initialize=transport.request('initialize',{
          clientID:'godot-mcp',clientName:'Godot MCP',adapterID:'godot',pathFormat:'path',linesStartAt1:true,columnsStartAt1:true,supportsVariableType:true,supportsVariablePaging:true
        },5000);
        initialize.catch(error=>this.rejectInitialized(transport,error instanceof Error?error:new Error(String(error))));
        await Promise.all([initialize,initialized]);
        await this.restoreManualEditorBreakpoints(transport,info);
        await transport.request('attach',{address:info.debugHost,port:info.debugPort},5000);
        await transport.request('configurationDone',{},5000);
      });
      const after=this.runtime.peek();
      if(this.transport!==transport||after.runId!==runId||after.ownership!=='session')throw new BridgeRpcError('RUNTIME_NOT_OWNED','Runtime changed during debugger attach');
      this.unavailableReason=null;this.state='READY';if(after.state==='breaked')this.maybeEstablishBreak();
    }catch(error){
      if(this.transport===transport){this.transport=null;this.attachedRunId=null;}
      this.rejectInitialized(transport,error instanceof Error?error:new Error(String(error)));transport.close();this.invalidateBreakContext();this.unavailableReason=error instanceof Error?error.message:String(error);this.state='UNAVAILABLE';
      if(error instanceof BridgeRpcError)throw error;
      throw new BridgeRpcError('DEBUGGER_ATTACH_FAILED',error instanceof Error?error.message:'Godot DAP handshake failed');
    }
  }

  private async requestScopeVariables(transport:DapTransport,reference:number,generation:{runtime:number;break:number}):Promise<Record<string,unknown>>{
    for(let attempt=0;attempt<GODOT_SCOPE_VARIABLE_RETRY_LIMIT;attempt++){
      try{
        const body=await transport.request('variables',{variablesReference:reference,start:0,count:DEFAULT_DEBUG_VARIABLE_PAGE},5000);
        this.assertGeneration(generation);
        return body;
      }catch(error){
        this.assertGeneration(generation);
        const pending=error instanceof DapRequestError&&error.command==='variables'&&error.message==='DAP variables failed: unknown';
        if(!pending||attempt===GODOT_SCOPE_VARIABLE_RETRY_LIMIT-1)throw error;
        await new Promise(resolve=>setTimeout(resolve,GODOT_SCOPE_VARIABLE_RETRY_DELAY_MS));
        this.assertGeneration(generation);
      }
    }
    throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','Godot DAP scope variables did not become available');
  }

  private async withDapBreakpointSync<T>(work:()=>Promise<T>):Promise<T>{
    await this.bridge.rpc.call('debugger.dap_sync.begin',{});
    let value:T|undefined;let primary:unknown=null;
    try{value=await work();}catch(error){primary=error;}
    try{await this.bridge.rpc.call('debugger.dap_sync.end',{});}catch(error){if(primary===null)primary=error;}
    if(primary!==null)throw primary;
    return value as T;
  }

  private async restoreManualEditorBreakpoints(transport:DapTransport,info:DebuggerInfoResult):Promise<void>{
    const owned=new Set(info.mcpBreakpoints.map(value=>this.breakpointKey(value.scriptPath,value.line)));
    const byScript=new Map<string,number[]>();
    for(const breakpoint of info.breakpoints){
      if(owned.has(this.breakpointKey(breakpoint.scriptPath,breakpoint.line)))continue;
      const lines=byScript.get(breakpoint.scriptPath)??[];lines.push(breakpoint.line);byScript.set(breakpoint.scriptPath,lines);
    }
    for(const scriptPath of [...byScript.keys()].sort()){
      const lines=[...new Set(byScript.get(scriptPath)!)].sort((a,b)=>a-b);
      const sourcePath=this.dapSourcePath(scriptPath);
      await transport.request('setBreakpoints',{
        source:{name:scriptPath.slice(scriptPath.lastIndexOf('/')+1),path:sourcePath},
        breakpoints:lines.map(line=>({line}))
      },5000);
    }
  }

  private dapSourcePath(scriptPath:string):string{
    const root=this.session.projectRoot.replaceAll('\\','/').replace(/\/+$/,'');
    return `${root}/${scriptPath.slice('res://'.length)}`;
  }

  private waitForInitialized(transport:DapTransport,timeoutMs:number):Promise<void>{
    return new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{
        if(this.initializedWaiter?.transport===transport)this.initializedWaiter=null;
        reject(new BridgeRpcError('DEBUGGER_ATTACH_FAILED','Timed out waiting for Godot DAP initialized event'));
      },timeoutMs);
      this.initializedWaiter={transport,timer,resolve:()=>{clearTimeout(timer);if(this.initializedWaiter?.transport===transport)this.initializedWaiter=null;resolve();},reject:error=>{clearTimeout(timer);if(this.initializedWaiter?.transport===transport)this.initializedWaiter=null;reject(error);}};
    });
  }

  private rejectInitialized(transport:DapTransport,error:Error):void{if(this.initializedWaiter?.transport===transport)this.initializedWaiter.reject(error);}

  private onDapEvent(event:DapEvent):void{
    if(event.event==='initialized'){this.initializedWaiter?.resolve();return;}
    if(event.event==='stopped'){
      const body=this.eventBody(event);const threadId=body.threadId;
      if(typeof threadId!=='number'||!Number.isInteger(threadId)||threadId<0){this.markProtocolUnavailable('DAP stopped event has invalid threadId');return;}
      this.pendingStoppedThreadId=threadId;this.maybeEstablishBreak();return;
    }
    if(event.event==='continued'){
      this.pendingStoppedThreadId=null;
      const status=this.runtime.peek();
      // RuntimeService is the ownership-correlated lifecycle authority. Godot's
      // DAP and EditorDebuggerSession signals can cross in flight, so a late
      // `continued` event must not erase a newer real break already observed
      // for this same owned run.
      if(status.ownership==='session'&&status.runId===this.attachedRunId&&status.state==='breaked')return;
      this.invalidateBreakContext();if(this.transport)this.state='READY';return;
    }
    if(event.event==='terminated'||event.event==='exited'){
      this.invalidateBreakContext();const status=this.runtime.peek();this.detachTransport();this.state=this.isActiveOwned(status)?'UNAVAILABLE':'DETACHED';
    }
  }

  private maybeEstablishBreak():void{
    const status=this.runtime.peek();
    if(!this.transport||this.attachedRunId!==status.runId||status.ownership!=='session'||status.state!=='breaked')return;
    if(this.state==='BREAKED'){this.pendingStoppedThreadId=null;return;}
    // Godot 4.6.3 exposes exactly one DAP thread (id=1). Session-owned
    // breakpoints applied through EditorDebuggerSession can interrupt the
    // runtime without producing a DAP `stopped` event because they are not
    // members of DAP's own breakpoint list. RuntimeService's correlated
    // `breaked` state is still authoritative, so use Godot's single thread as
    // the compatibility fallback while retaining a real DAP transport.
    this.stoppedThreadId=this.pendingStoppedThreadId??GODOT_MAIN_DEBUG_THREAD_ID;
    this.pendingStoppedThreadId=null;this.refs.beginBreak();this.state='BREAKED';
  }

  private async control(action:DebugControlAction,command:string):Promise<DebugControlResult>{
    const context=this.requireBreakContext();if(this.controlBusy)throw new BridgeRpcError('DEBUG_CONTROL_BUSY','Another debugger control operation is in flight');
    this.controlBusy=true;const runId=context.runId;const transport=this.transport!;const breakGeneration=this.refs.currentBreakGeneration();
    try{
      await transport.request(command,{threadId:context.threadId},5000);
      const current=this.runtime.peek();if(current.runId!==runId||current.ownership!=='session')throw new BridgeRpcError('STALE_DEBUG_REFERENCE','Runtime changed during debugger control');
      // A fast step can continue, stop again, and publish its new break before
      // Godot returns the DAP response. Invalidate only the context that issued
      // this control; never clobber a newer break generation.
      if(this.state==='BREAKED'&&this.refs.currentBreakGeneration()===breakGeneration){this.invalidateBreakContext();this.state='RESUMING';}
      return {accepted:true,runId,action};
    }finally{this.controlBusy=false;}
  }

  private async controlViaBridge(action:DebugControlAction,method:string):Promise<DebugControlResult>{
    const context=this.requireBreakContext();if(this.controlBusy)throw new BridgeRpcError('DEBUG_CONTROL_BUSY','Another debugger control operation is in flight');
    this.controlBusy=true;const runId=context.runId;const breakGeneration=this.refs.currentBreakGeneration();
    try{
      const raw=await this.bridge.rpc.call(method,{run_id:runId});
      const result=this.parseBridge(DebugControlResultSchema,raw,'debugger control');
      if(result.runId!==runId||result.action!==action)throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','Private debugger control response does not match the active runtime');
      const current=this.runtime.peek();if(current.runId!==runId||current.ownership!=='session')throw new BridgeRpcError('STALE_DEBUG_REFERENCE','Runtime changed during debugger control');
      if(this.state==='BREAKED'&&this.refs.currentBreakGeneration()===breakGeneration){this.invalidateBreakContext();this.state='RESUMING';}
      return result;
    }finally{this.controlBusy=false;}
  }

  private requireBreakContext():{runId:string;threadId:number;breakId:string}{
    const status=this.runtime.peek();
    if(status.ownership!=='session'||!status.runId)throw new BridgeRpcError('RUNTIME_NOT_OWNED','This session does not own the game');
    if(!this.transport||this.attachedRunId!==status.runId||['DETACHED','ATTACHING','UNAVAILABLE'].includes(this.state))throw new BridgeRpcError('DEBUGGER_UNAVAILABLE','Debugger is unavailable for the current runtime');
    if(status.state!=='breaked')throw new BridgeRpcError('RUNTIME_NOT_BREAKED','Runtime is not interrupted in the debugger');
    const breakId=this.refs.currentBreakId();
    if(this.state!=='BREAKED'||this.stoppedThreadId===null||!breakId)throw new BridgeRpcError('DEBUGGER_UNAVAILABLE','Debugger stop context is not ready');
    return {runId:status.runId,threadId:this.stoppedThreadId,breakId};
  }

  private captureGeneration():{runtime:number;break:number}{return {runtime:this.refs.currentRuntimeGeneration(),break:this.refs.currentBreakGeneration()};}
  private assertGeneration(expected:{runtime:number;break:number}):void{
    if(expected.runtime!==this.refs.currentRuntimeGeneration()||expected.break!==this.refs.currentBreakGeneration())throw new BridgeRpcError('STALE_DEBUG_REFERENCE','Debugger context changed while the request was in flight');
  }

  private mapVariables(body:Record<string,unknown>,limit:number):DebugVariable[]{
    if(!Array.isArray(body.variables))throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP variables response is malformed');
    return body.variables.slice(0,limit).map(raw=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP variable is malformed');
      const value=raw as Record<string,unknown>;if(typeof value.name!=='string')throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP variable name is missing');
      const reference=this.requiredInteger(value.variablesReference,'variable variablesReference',0);
      const text=value.value===undefined?'':String(value.value);const truncated=text.length>MAX_DEBUG_VALUE_CHARS;
      return {name:value.name.slice(0,1024),type:typeof value.type==='string'?value.type.slice(0,1024):'',value:text.slice(0,MAX_DEBUG_VALUE_CHARS),variableRef:reference>0?this.refs.createVariableRef(reference):null,valueTruncated:truncated};
    });
  }

  private normalizeSourcePath(raw:string):string{
    const normalized=raw.replaceAll('\\','/');
    if(normalized.startsWith('res://')){
      const parsed=DebugBreakpointPathSchema.safeParse(normalized);if(parsed.success)return parsed.data;
      throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP source path is outside supported GDScript scope');
    }
    const root=this.session.projectRoot.replaceAll('\\','/').replace(/\/+$/,'');
    const fold=(value:string)=>/^[A-Za-z]:\//.test(value)?value.toLowerCase():value;
    if(!fold(normalized).startsWith(`${fold(root)}/`))throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP source path is outside the project root');
    const candidate=`res://${normalized.slice(root.length+1)}`;const parsed=DebugBreakpointPathSchema.safeParse(candidate);
    if(!parsed.success)throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','DAP source is not a supported GDScript path');
    return parsed.data;
  }

  private async reconcileOwnedBreakpoints():Promise<void>{
    const info=await this.readDebuggerInfo();
    if(info.breakpointOwnerSessionId!==this.session.id){this.ownedBreakpoints.clear();return;}
    const physical=new Set(info.breakpoints.map(value=>this.breakpointKey(value.scriptPath,value.line)));
    const mirror=new Set(info.mcpBreakpoints.map(value=>this.breakpointKey(value.scriptPath,value.line)));
    for(const [key,breakpoint] of [...this.ownedBreakpoints]){
      if(mirror.has(key))continue;
      if(physical.has(key)){this.ownedBreakpoints.delete(key);continue;}
      const raw=await this.bridge.rpc.call('debugger.breakpoint.set',{script_path:breakpoint.scriptPath,line:breakpoint.line});
      this.parseBridge(DebuggerBreakpointApplyResultSchema,raw,'breakpoint reapply');
    }
  }

  private async readDebuggerInfo(){
    this.requireEditor();
    const raw=await this.bridge.rpc.call('debugger.info',{});
    return this.parseBridge(DebuggerInfoResultSchema,raw,'debugger info');
  }

  private parseBridge<T>(schema:{parse(value:unknown):T},value:unknown,label:string):T{
    try{return schema.parse(value);}catch{throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR',`Malformed private ${label} response`);}
  }

  private requireEditor():void{this.assertOpen();if(!this.bridge.connected)throw new BridgeRpcError('EDITOR_NOT_CONNECTED','Editor is not connected');}
  private assertOpen():void{if(this.closed)throw new BridgeRpcError('SESSION_CLOSED','Debugger service is closed');}
  private breakpointKey(scriptPath:string,line:number):string{return `${scriptPath}:${line}`;}
  private containsBreakpoint(values:readonly DebugBreakpoint[],candidate:DebugBreakpoint):boolean{return values.some(value=>value.scriptPath===candidate.scriptPath&&value.line===candidate.line);}

  private invalidateBreakContext():void{
    if(this.refs.currentBreakId()!==null)this.refs.invalidateBreak();
    this.stoppedThreadId=null;this.pendingStoppedThreadId=null;
  }

  private detachTransport():void{
    const transport=this.transport;this.transport=null;this.attachedRunId=null;
    if(transport){this.rejectInitialized(transport,new Error('Debugger transport detached'));transport.close();}
  }

  private onUnexpectedTransportClose(transport:DapTransport,_error:Error):void{
    if(this.transport!==transport)return;this.transport=null;this.attachedRunId=null;this.invalidateBreakContext();
    const active=this.isActiveOwned(this.runtime.peek());this.unavailableReason=active?_error.message:null;this.state=active?'UNAVAILABLE':'DETACHED';
  }

  private markProtocolUnavailable(message:string):void{
    const transport=this.transport;this.transport=null;this.attachedRunId=null;this.invalidateBreakContext();this.unavailableReason=message;this.state='UNAVAILABLE';if(transport)transport.close();
  }

  private eventBody(event:DapEvent):Record<string,unknown>{return event.body&&typeof event.body==='object'&&!Array.isArray(event.body)?event.body as Record<string,unknown>:{};}
  private requiredInteger(value:unknown,label:string,min:number):number{
    if(typeof value!=='number'||!Number.isInteger(value)||value<min)throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR',`DAP ${label} is invalid`);return value;
  }
}
