import {randomUUID} from 'node:crypto';
import {RuntimeStatusSchema,RunTargetSchema,NO_RUNTIME_FEATURES,type RuntimeStatus,type RunTarget,type BridgeRuntimeEvent,type DiagnosticPage} from '@godot-mcp/protocol';
import type {Session} from '../session/session.js';
import type {SessionStore} from '../session/session-store.js';
import {BridgeRpcError,type RpcRouter} from '../bridge/rpc-router.js';
import {DiagnosticStore} from './diagnostic-store.js';

interface RuntimeBridge {connected:boolean;rpc:Pick<RpcRouter,'call'>;}
export interface RuntimeDiagnosticTail extends DiagnosticPage {errorCount:number;warningCount:number;outputCount:number;}
export class RuntimeService {
  private current:RuntimeStatus={state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:{...NO_RUNTIME_FEATURES},errorCode:null};
  private target:RunTarget|null=null;
  private launching=false;
  private closed=false;
  private lastRunId:string|null=null;
  private readonly known=new Set<string>();
  private readonly diagnosticRuns=new Set<string>();
  private writes:Promise<void>=Promise.resolve();
  private writeError:Error|null=null;
  readonly diagnostics:DiagnosticStore;
  constructor(private readonly session:Session,private readonly sessions:SessionStore,private readonly bridge:RuntimeBridge){this.diagnostics=new DiagnosticStore(sessions,session.id);}
  private apply(status:RuntimeStatus):void {
    this.current=status;this.session.runtimeConnected=status.connected;
    if(status.runId && status.features.diagnostics)this.diagnosticRuns.add(status.runId);
    if(status.runId && this.known.has(status.runId)) {
      const ended=['stopped','failed','disconnected'].includes(status.state);
      this.writes=this.writes.then(()=>this.sessions.update(this.session.id,m=>({...m,runtimeRuns:m.runtimeRuns.map(r=>r.runId===status.runId?{...r,state:status.state,scenePath:status.scenePath??r.scenePath,endedAt:ended?(r.endedAt??new Date().toISOString()):r.endedAt,diagnosticsComplete:false,persistenceTruncated:this.diagnostics.degraded(r.runId)}:r)}))).then(()=>{this.writeError=null;}).catch(error=>{this.writeError=error;});
    }
  }
  acceptEvent(event:BridgeRuntimeEvent):void {
    if(event.sessionId!==this.session.id)return;
    if(event.event==='runtime.state') {
      if(event.data.runId!==this.current.runId)return;
      this.apply(event.data);
    } else if(event.event==='runtime.diagnostics' && this.known.has(event.data.runId)) {void this.diagnostics.append(event.data).catch(()=>{});}
  }
  disconnect():void {if(['stopped','failed'].includes(this.current.state)){this.session.runtimeConnected=false;return;}this.apply({...this.current,state:'disconnected',connected:false,features:{...NO_RUNTIME_FEATURES}});}
  async status():Promise<RuntimeStatus> {
    if(!this.bridge.connected)return {...this.current,state:'disconnected',connected:false,features:{...NO_RUNTIME_FEATURES}};
    const status=RuntimeStatusSchema.parse(await this.bridge.rpc.call('runtime.status',{}));
    this.apply(status);return status;
  }
  async run(input:RunTarget):Promise<RuntimeStatus> {
    if(this.closed)throw new BridgeRpcError('SESSION_CLOSED','Session is closing');
    if(this.launching)throw new BridgeRpcError('RUNTIME_ALREADY_RUNNING','A launch is already in progress');
    this.launching=true;
    try {
      const target=RunTargetSchema.parse(input);const old=await this.status();
      if(['starting','running','paused','breaked','stopping'].includes(old.state))throw new BridgeRpcError('RUNTIME_ALREADY_RUNNING','A game is already active');
      const runId=randomUUID();this.known.add(runId);this.lastRunId=runId;this.target=target;this.diagnostics.register(runId);
      await this.sessions.update(this.session.id,m=>({...m,runtimeRuns:[...m.runtimeRuns,{runId,scenePath:target.target==='path'?target.path:null,startedAt:new Date().toISOString(),endedAt:null,state:'starting',logPath:`logs/runtime/${runId}.jsonl`,diagnosticsComplete:false,persistenceTruncated:false}]}));
      this.current={...this.current,state:'starting',runId,connected:false,ownership:'session'};
      try {
        const result=RuntimeStatusSchema.parse(await this.bridge.rpc.call('runtime.start',{...target,runId,mcpSessionId:this.session.id},20000));
        if(result.runId!==runId || !result.connected)throw new BridgeRpcError('RUNTIME_START_FAILED','Runtime did not become ready');
        this.apply(result);await this.flush();return result;
      } catch(error) {
        if(error instanceof BridgeRpcError && error.code==='MANIFEST_WRITE_FAILED')this.current={...this.current,errorCode:error.code};
        else if(this.current.state!=='stopped')this.apply({...this.current,state:'failed',connected:false,errorCode:error instanceof BridgeRpcError?error.code:'RUNTIME_START_FAILED'});
        throw error;
      }
    } finally {this.launching=false;}
  }
  async stop():Promise<{stopped:boolean;runId:string|null}> {
    const result=await this.bridge.rpc.call('runtime.stop',{},7000) as {stopped:boolean;runId:string|null};
    if(result.stopped || this.current.state==='stopped')this.apply({...this.current,state:'stopped',connected:false});
    await this.flush();return result;
  }
  async restart():Promise<RuntimeStatus> {
    const status=await this.status();
    if(status.ownership!=='session'||!this.target)throw new BridgeRpcError('RUNTIME_NOT_OWNED','This session does not own the game');
    await this.stop();return this.run(this.target);
  }
  async request(method:string,params:Record<string,unknown>={},timeout=5000):Promise<any> {
    const status=await this.status();
    if(status.state==='breaked')throw new BridgeRpcError('RUNTIME_BREAKED','Game is interrupted in the debugger');
    if(!status.connected)throw new BridgeRpcError('RUNTIME_NOT_CONNECTED','Runtime is not ready');
    if(status.ownership!=='session')throw new BridgeRpcError('RUNTIME_NOT_OWNED','This session does not own the game');
    const result=await this.bridge.rpc.call(method,{...params,_run_id:status.runId},timeout) as Record<string,unknown>;
    if((result.runId??result.run_id)!==status.runId)throw new BridgeRpcError('RUNTIME_NOT_CONNECTED','Runtime changed during request');
    if(method==='runtime.pause'||method==='runtime.resume')this.apply(RuntimeStatusSchema.parse(result));
    return result;
  }
  async tailDiagnostics(limit=100):Promise<RuntimeDiagnosticTail|null> {
    const status=await this.status();
    if(!status.runId||!status.features.diagnostics||!this.diagnosticRuns.has(status.runId))return null;
    await this.diagnostics.flush();
    return {...this.diagnostics.tail(status.runId,limit),...this.diagnostics.counts(status.runId)};
  }
  async query(kind:'all'|'output'|'error'|'warning',input:{run_id?:string|undefined;after:number;limit:number}) {
    const id=input.run_id??this.lastRunId;if(!id)throw new BridgeRpcError('NO_RUNTIME_HISTORY','No execution in this session');
    if(!this.known.has(id))throw new BridgeRpcError('RUN_NOT_FOUND','Run not in this session');
    if(!this.diagnosticRuns.has(id))throw new BridgeRpcError('CAPABILITY_UNAVAILABLE','Native diagnostics are unavailable for this run');
    await this.diagnostics.flush();return this.diagnostics.query(id,kind,input.after,input.limit);
  }
  async flush():Promise<void>{await this.diagnostics.flush();await this.writes;if(this.writeError)throw this.writeError;}
  async close():Promise<void>{this.closed=true;try{if(this.bridge.connected&&this.current.ownership==='session')await this.stop();}finally{await this.flush();}}
}
