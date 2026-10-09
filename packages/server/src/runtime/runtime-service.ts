import {randomUUID} from 'node:crypto';
import {RuntimeStatusSchema,RuntimeStartupSchema,RunTargetSchema,NO_RUNTIME_FEATURES,type RuntimeStatus,type RunTarget,type BridgeRuntimeEvent,type DiagnosticPage} from '@godot-mcp/protocol';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {Session} from '../session/session.js';
import type {SessionStore} from '../session/session-store.js';
import {BridgeRpcError,type RpcRouter} from '../bridge/rpc-router.js';
import {DiagnosticStore} from './diagnostic-store.js';
import {parseStartupLog} from './startup-diagnostics.js';

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
  private readonly startupLogs=new Map<string,string>();
  private writes:Promise<void>=Promise.resolve();
  private writeError:Error|null=null;
  private readonly listeners=new Set<(status:RuntimeStatus)=>void>();
  readonly diagnostics:DiagnosticStore;
  constructor(private readonly session:Session,private readonly sessions:SessionStore,private readonly bridge:RuntimeBridge){this.diagnostics=new DiagnosticStore(sessions,session.id);}
  private apply(status:RuntimeStatus):void {
    const logPath=status.runId?this.startupLogs.get(status.runId):undefined;
    if(logPath&&status.startup)status={...status,startup:{...status.startup,logPath}};
    this.current=status;this.session.runtimeConnected=status.connected;
    if(status.runId && status.features.diagnostics)this.diagnosticRuns.add(status.runId);
    if(status.runId && this.known.has(status.runId)) {
      const ended=['stopped','failed','disconnected'].includes(status.state);
      this.writes=this.writes.then(()=>this.sessions.update(this.session.id,m=>({...m,runtimeRuns:m.runtimeRuns.map(r=>r.runId===status.runId?{...r,state:status.state,scenePath:status.scenePath??r.scenePath,endedAt:ended?(r.endedAt??new Date().toISOString()):r.endedAt,diagnosticsComplete:false,persistenceTruncated:this.diagnostics.degraded(r.runId)}:r)}))).then(()=>{this.writeError=null;}).catch(error=>{this.writeError=error;});
    }
    for(const listener of this.listeners){try{listener(this.peek());}catch{}}
  }
  peek():RuntimeStatus{return structuredClone(this.current);}
  subscribe(listener:(status:RuntimeStatus)=>void):()=>void{this.listeners.add(listener);listener(this.peek());return()=>this.listeners.delete(listener);}
  acceptEvent(event:BridgeRuntimeEvent):void {
    if(event.sessionId!==this.session.id)return;
    if(event.event==='runtime.state') {
      if(event.data.runId!==this.current.runId)return;
      this.apply(event.data);
    } else if(event.event==='runtime.diagnostics' && this.known.has(event.data.runId)) {this.diagnosticRuns.add(event.data.runId);void this.diagnostics.append(event.data).catch(()=>{});}
  }
  disconnect():void {if(['stopped','failed'].includes(this.current.state)){this.session.runtimeConnected=false;return;}this.apply({...this.current,state:'disconnected',connected:false,features:{...NO_RUNTIME_FEATURES}});}
  async status():Promise<RuntimeStatus> {
    if(!this.bridge.connected)return {...this.current,state:['stopped','failed'].includes(this.current.state)?this.current.state:'disconnected',connected:false,features:{...NO_RUNTIME_FEATURES}};
    const status=RuntimeStatusSchema.parse(await this.bridge.rpc.call('runtime.status',{}));
    this.apply(status);return this.peek();
  }
  async run(input:RunTarget):Promise<RuntimeStatus> {
    if(this.closed)throw new BridgeRpcError('SESSION_CLOSED','Session is closing');
    if(this.launching)throw new BridgeRpcError('RUNTIME_ALREADY_RUNNING','A launch is already in progress');
    this.launching=true;
    try {
      const target=RunTargetSchema.parse(input);const old=await this.status();
      if(['starting','running','paused','breaked','stopping'].includes(old.state))throw new BridgeRpcError('RUNTIME_ALREADY_RUNNING','A game is already active');
      const runId=randomUUID();this.known.add(runId);this.lastRunId=runId;this.target=target;this.diagnostics.register(runId);
      const dir=await this.sessions.ensureDirectory(this.session.id,'logs/runtime');
      const bootFile=path.join(dir,`${runId}.boot.log`);
      const handle=await fs.open(bootFile,'wx',0o600);await handle.close();
      this.startupLogs.set(runId,bootFile);
      const startupLogPath=path.relative(this.session.projectRoot,bootFile).split(path.sep).join('/');
      await this.sessions.update(this.session.id,m=>({...m,runtimeRuns:[...m.runtimeRuns,{runId,scenePath:target.target==='path'?target.path:null,startedAt:new Date().toISOString(),endedAt:null,state:'starting',logPath:`logs/runtime/${runId}.jsonl`,startupLogPath:`logs/runtime/${runId}.boot.log`,diagnosticsComplete:false,persistenceTruncated:false}]}));
      this.current={...this.current,state:'starting',runId,connected:false,ownership:'session',startup:{phase:'preparing',processState:'not_started',exitCode:null,logPath:bootFile}};
      try {
        const result=RuntimeStatusSchema.parse(await this.bridge.rpc.call('runtime.start',{...target,runId,mcpSessionId:this.session.id,startupLogPath},20000));
        if(result.runId!==runId || !result.connected)throw new BridgeRpcError('RUNTIME_START_FAILED','Runtime did not become ready');
        this.apply(result);await this.flush();return this.peek();
      } catch(error) {
        const startup=error instanceof BridgeRpcError?RuntimeStartupSchema.safeParse(error.details?.startup):null;
        const captured=await this.captureStartupLog(runId);
        if(error instanceof BridgeRpcError && error.code==='MANIFEST_WRITE_FAILED')this.current={...this.current,errorCode:error.code};
        else if(this.current.state!=='stopped')this.apply({...this.current,state:'failed',connected:false,errorCode:error instanceof BridgeRpcError?error.code:'RUNTIME_START_FAILED',
          startup:startup?.success?{...startup.data,logPath:bootFile}:this.current.startup??{phase:'failed',processState:'unknown',exitCode:null,logPath:bootFile}});
        await this.flush();
        if(error instanceof BridgeRpcError)throw new BridgeRpcError(error.code,error.message,{...error.details,runId,startup:this.current.startup,logTail:captured.tail,logTruncated:captured.truncated});
        throw error;
      }
    } finally {this.launching=false;}
  }
  private async captureStartupLog(runId:string):Promise<{tail:string[];truncated:boolean}>{
    const file=this.startupLogs.get(runId);if(!file)return {tail:[],truncated:false};
    try{
      const stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile())return {tail:[],truncated:true};
      const handle=await fs.open(file,'r');const length=Math.min(stat.size,256*1024);
      const bytes=Buffer.alloc(length);try{await handle.read(bytes,0,length,0);}finally{await handle.close();}
      const offset=this.diagnostics.tail(runId,1).nextCursor;
      const parsed=parseStartupLog(bytes.toString('utf8'),runId,offset);
      if(!this.diagnosticRuns.has(runId)){
        for(let i=0;i<parsed.entries.length;i+=50)await this.diagnostics.append({runId,entries:parsed.entries.slice(i,i+50),dropped:0});
      }
      this.diagnosticRuns.add(runId);
      return {tail:parsed.tail,truncated:parsed.truncated||stat.size>length};
    }catch{return {tail:[],truncated:true};}
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
    if(!status.runId||!this.diagnosticRuns.has(status.runId))return null;
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
