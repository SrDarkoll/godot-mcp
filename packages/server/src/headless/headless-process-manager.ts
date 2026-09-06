import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import {
  HeadlessExecutionRecordSchema,
  HeadlessOutputPageSchema,
  HeadlessStatusResultSchema,
  HeadlessStopResultSchema,
  type HeadlessExecutionKind,
  type HeadlessExecutionRecord,
  type HeadlessGetOutputParams,
  type HeadlessImportParams,
  type HeadlessOutputPage,
  type HeadlessRunSceneParams,
  type HeadlessRunTestsParams,
  type HeadlessStatusResult,
  type HeadlessStopResult,
  type HeadlessValidateProjectParams
} from '@godot-mcp/protocol';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import type { Session } from '../session/session.js';
import type { SessionStore } from '../session/session-store.js';
import { resolveHeadlessTarget } from './headless-paths.js';
import { HeadlessOutputStore } from './headless-output-store.js';

type SpawnImpl=(command:string,args:readonly string[],options:SpawnOptionsWithoutStdio)=>ChildProcessWithoutNullStreams;
interface ManagerOptions {godotBin:string|null;env?:NodeJS.ProcessEnv;spawnImpl?:SpawnImpl;}
interface ActiveExecution {
  child:ChildProcessWithoutNullStreams;
  record:HeadlessExecutionRecord;
  completion:Promise<HeadlessExecutionRecord>;
  resolveCompletion:(record:HeadlessExecutionRecord)=>void;
  rejectCompletion:(error:Error)=>void;
  spawned:Promise<void>;
  resolveSpawned:()=>void;
  rejectSpawned:(error:Error)=>void;
  timer:ReturnType<typeof setTimeout>|null;
  finalized:boolean;
  spawnedSuccessfully:boolean;
}

const STOP_GRACE_MS=1500;
const TERMINAL=new Set(['exited','failed']);

export class HeadlessProcessManager {
  private readonly output:HeadlessOutputStore;
  private readonly spawnImpl:SpawnImpl;
  private readonly env:NodeJS.ProcessEnv;
  private active:ActiveExecution|null=null;
  private closed=false;

  constructor(private readonly session:Session,private readonly sessions:SessionStore,private readonly options:ManagerOptions){
    this.output=new HeadlessOutputStore(session,sessions);
    this.spawnImpl=options.spawnImpl ?? (spawn as unknown as SpawnImpl);
    this.env={...(options.env ?? process.env),GODOT_MCP_HEADLESS_CHILD:'1'};
  }

  private async resolveBinary():Promise<string>{
    const configured=this.options.godotBin?.trim();
    if(!configured)throw new BridgeRpcError('HEADLESS_GODOT_UNAVAILABLE','No Godot executable is configured');
    try {
      const stat=await fs.lstat(configured);
      if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Invalid binary');
      const real=await fs.realpath(configured);
      const realStat=await fs.lstat(real);
      if(!realStat.isFile()||realStat.isSymbolicLink())throw new Error('Invalid binary');
      if(process.platform!=='win32')await fs.access(real,fs.constants.X_OK);
      return real;
    } catch {
      throw new BridgeRpcError('HEADLESS_GODOT_UNAVAILABLE','Configured Godot executable is unavailable');
    }
  }

  private snapshot(record:HeadlessExecutionRecord):HeadlessExecutionRecord{
    const stats=this.output.stats(record.executionId);
    return HeadlessExecutionRecordSchema.parse({...record,...stats});
  }

  private async persist(record:HeadlessExecutionRecord):Promise<void>{
    const parsed=HeadlessExecutionRecordSchema.parse(record);
    await this.sessions.update(this.session.id,manifest=>{
      const records=[...manifest.headlessRuns.filter(item=>item.executionId!==parsed.executionId),parsed];
      while(records.length>20){
        const removable=records.findIndex(item=>TERMINAL.has(item.state));
        if(removable<0)break;
        records.splice(removable,1);
      }
      return {...manifest,headlessRuns:records};
    });
  }

  private assertStartable():void{
    if(this.closed)throw new BridgeRpcError('SESSION_CLOSED','Session is closing');
    if(this.active)throw new BridgeRpcError('HEADLESS_BUSY','A Godot headless execution is already active');
  }

  private async finalize(active:ActiveExecution,changes:Partial<HeadlessExecutionRecord>):Promise<HeadlessExecutionRecord>{
    if(active.finalized)return this.snapshot(active.record);
    active.finalized=true;
    if(active.timer){clearTimeout(active.timer);active.timer=null;}
    await this.output.flush();
    active.record=this.snapshot({...active.record,...changes,endedAt:changes.endedAt ?? new Date().toISOString()});
    await this.persist(active.record);
    if(this.active===active)this.active=null;
    active.resolveCompletion(active.record);
    return active.record;
  }

  private async fail(active:ActiveExecution,error:BridgeRpcError):Promise<void>{
    if(active.finalized)return;
    active.finalized=true;
    if(active.timer){clearTimeout(active.timer);active.timer=null;}
    await this.output.flush();
    active.record=this.snapshot({...active.record,state:'failed',endedAt:new Date().toISOString(),errorCode:error.code,exitCode:null,signal:null});
    await this.persist(active.record);
    if(this.active===active)this.active=null;
    active.rejectSpawned(error);
    active.rejectCompletion(error);
  }

  private capture(active:ActiveExecution,stream:'stdout'|'stderr',chunk:Buffer|string):void{
    void this.output.append(active.record.executionId,stream,chunk.toString()).then(_result=>{
      active.record={...active.record,...this.output.stats(active.record.executionId)};
    }).catch(async()=>{
      if(!active.finalized){
        active.record={...active.record,errorCode:'HEADLESS_OUTPUT_FAILED'};
      }
    });
  }

  private async start(kind:HeadlessExecutionKind,args:readonly string[],meta:{scenePath?:string;scriptPath?:string;timeoutMs?:number}={}):Promise<HeadlessExecutionRecord>{
    this.assertStartable();
    const binary=await this.resolveBinary();
    const executionId=randomUUID();
    const record=HeadlessExecutionRecordSchema.parse({
      executionId,kind,state:'starting',startedAt:new Date().toISOString(),endedAt:null,exitCode:null,signal:null,pid:null,
      scenePath:meta.scenePath ?? null,scriptPath:meta.scriptPath ?? null,logPath:`logs/headless/${executionId}.jsonl`,
      outputBytes:0,outputTruncated:false,timedOut:false,stoppedByRequest:false,errorCode:null
    });
    await this.persist(record);

    let resolveCompletion!:(value:HeadlessExecutionRecord)=>void;
    let rejectCompletion!:(error:Error)=>void;
    const completion=new Promise<HeadlessExecutionRecord>((resolve,reject)=>{resolveCompletion=resolve;rejectCompletion=reject;});
    // Persistent starts return before completion; keep the lifecycle rejection observed
    // so a later process failure cannot surface as an unhandled rejection.
    void completion.catch(()=>{});
    let resolveSpawned!:()=>void;
    let rejectSpawned!:(error:Error)=>void;
    const spawned=new Promise<void>((resolve,reject)=>{resolveSpawned=resolve;rejectSpawned=reject;});

    let child:ChildProcessWithoutNullStreams;
    try {
      child=this.spawnImpl(binary,args,{shell:false,cwd:this.session.projectRoot,env:this.env});
    } catch {
      const failed={...record,state:'failed' as const,endedAt:new Date().toISOString(),errorCode:'HEADLESS_SPAWN_FAILED'};
      await this.persist(failed);
      throw new BridgeRpcError('HEADLESS_SPAWN_FAILED','Unable to spawn Godot headless process');
    }

    const active:ActiveExecution={child,record,completion,resolveCompletion,rejectCompletion,spawned,resolveSpawned,rejectSpawned,timer:null,finalized:false,spawnedSuccessfully:false};
    this.active=active;
    child.stdout.on('data',chunk=>this.capture(active,'stdout',chunk));
    child.stderr.on('data',chunk=>this.capture(active,'stderr',chunk));
    child.once('spawn',()=>{
      active.spawnedSuccessfully=true;
      void (async()=>{
        if(active.finalized)return;
        active.record={...active.record,state:'running',pid:child.pid ?? null};
        await this.persist(this.snapshot(active.record));
        active.resolveSpawned();
      })().catch(error=>{
        const failure=new BridgeRpcError('MANIFEST_WRITE_FAILED',error instanceof Error?error.message:'Unable to persist headless state');
        // The OS child already exists. Preserve ownership even though start cannot
        // report success, otherwise another Godot process could be launched.
        active.record={...active.record,errorCode:'MANIFEST_WRITE_FAILED'};
        active.rejectSpawned(failure);
      });
    });
    child.once('error',error=>{
      if(!active.spawnedSuccessfully){
        void this.fail(active,new BridgeRpcError('HEADLESS_SPAWN_FAILED','Godot headless process failed'));
        return;
      }
      // After 'spawn', an error event is process state, not a spawn failure.
      // Keep the child owned until close/stop proves termination.
      const message=error instanceof Error?error.message:String(error);
      active.record={...active.record,errorCode:'HEADLESS_PROCESS_ERROR'};
      this.capture(active,'stderr',`[godot-mcp] child process error: ${message}\n`);
      void this.persist(this.snapshot(active.record)).catch(()=>{});
    });
    child.once('close',(code,signal)=>{
      void (async()=>{
        if(active.finalized)return;
        const terminalErrorCode=active.record.timedOut?'HEADLESS_TIMEOUT':active.record.errorCode;
        await this.finalize(active,{
          state:terminalErrorCode?'failed':'exited',
          exitCode:code,
          signal:signal?String(signal):null,
          errorCode:terminalErrorCode
        });
      })().catch(error=>active.rejectCompletion(error instanceof Error?error:new Error(String(error))));
    });

    if(meta.timeoutMs!==undefined){
      active.timer=setTimeout(()=>{
        void this.terminateActive(active,false,true).catch(error=>{
          active.rejectCompletion(error instanceof Error?error:new Error(String(error)));
        });
      },meta.timeoutMs);
    }

    await active.spawned;
    if(meta.timeoutMs!==undefined)return active.completion;
    if(active.finalized)return active.completion;
    return this.snapshot(active.record);
  }

  private async completionWithin(active:ActiveExecution,ms:number):Promise<HeadlessExecutionRecord|null>{
    return Promise.race([
      active.completion.then(record=>record).catch(()=>null),
      new Promise<null>(resolve=>setTimeout(()=>resolve(null),ms))
    ]);
  }

  private async terminateActive(active:ActiveExecution,stoppedByRequest:boolean,timedOut:boolean):Promise<HeadlessExecutionRecord>{
    if(active.finalized)return this.snapshot(active.record);
    active.record={...active.record,state:'stopping',stoppedByRequest:active.record.stoppedByRequest||stoppedByRequest,timedOut:active.record.timedOut||timedOut};
    await this.persist(this.snapshot(active.record));
    let signalled=false;
    try { signalled=active.child.kill('SIGTERM'); }
    catch { signalled=false; }
    let result=await this.completionWithin(active,STOP_GRACE_MS);
    if(result)return result;
    try { signalled=active.child.kill('SIGKILL') || signalled; }
    catch { /* handled below */ }
    result=await this.completionWithin(active,STOP_GRACE_MS);
    if(result)return result;
    if(!signalled)throw new BridgeRpcError('HEADLESS_STOP_FAILED','Unable to stop owned Godot process');
    throw new BridgeRpcError('HEADLESS_STOP_FAILED','Owned Godot process did not exit after termination');
  }

  async validateProject(args:HeadlessValidateProjectParams):Promise<HeadlessExecutionRecord>{
    return this.start('validate_project',['--headless','--path',this.session.projectRoot,'--editor','--quit'],{timeoutMs:args.timeout_ms});
  }
  async importProject(args:HeadlessImportParams):Promise<HeadlessExecutionRecord>{
    return this.start('import',['--headless','--path',this.session.projectRoot,'--import'],{timeoutMs:args.timeout_ms});
  }
  async run():Promise<HeadlessExecutionRecord>{
    return this.start('run',['--headless','--path',this.session.projectRoot]);
  }
  async runScene(args:HeadlessRunSceneParams):Promise<HeadlessExecutionRecord>{
    this.assertStartable();
    const target=await resolveHeadlessTarget(this.session.projectRoot,args.scene_path,'.tscn');
    return this.start('run_scene',['--headless','--path',this.session.projectRoot,target.resourcePath],{scenePath:target.resourcePath});
  }
  async runTests(args:HeadlessRunTestsParams):Promise<HeadlessExecutionRecord>{
    this.assertStartable();
    const target=await resolveHeadlessTarget(this.session.projectRoot,args.script_path,'.gd');
    return this.start('run_tests',['--headless','--path',this.session.projectRoot,'--script',target.resourcePath],{scriptPath:target.resourcePath,timeoutMs:args.timeout_ms});
  }

  async status():Promise<HeadlessStatusResult>{
    let godotAvailable=true;try{await this.resolveBinary();}catch{godotAvailable=false;}
    const manifest=await this.sessions.read(this.session.id);
    const active=this.active?this.snapshot(this.active.record):null;
    const last=active ?? manifest.headlessRuns.at(-1) ?? null;
    return HeadlessStatusResultSchema.parse({godotAvailable,active,last});
  }

  async getOutput(args:HeadlessGetOutputParams):Promise<HeadlessOutputPage>{
    const manifest=await this.sessions.read(this.session.id);
    const executionId=args.execution_id ?? this.active?.record.executionId ?? manifest.headlessRuns.at(-1)?.executionId;
    if(!executionId)throw new BridgeRpcError('HEADLESS_EXECUTION_NOT_FOUND','No headless execution exists in this session');
    const active=this.active;
    const record=active && active.record.executionId===executionId
      ? this.snapshot(active.record)
      : manifest.headlessRuns.find(item=>item.executionId===executionId);
    if(!record)throw new BridgeRpcError('HEADLESS_EXECUTION_NOT_FOUND','Headless execution is not in this session');
    const page=await this.output.page(executionId,args.after,args.limit);
    return HeadlessOutputPageSchema.parse({executionId,entries:page.entries,nextCursor:page.nextCursor,truncated:record.outputTruncated||page.truncated,exitCode:record.exitCode,state:record.state});
  }

  async stop():Promise<HeadlessStopResult>{
    const active=this.active;
    if(!active)return HeadlessStopResultSchema.parse({stopped:false,execution:null});
    const execution=await this.terminateActive(active,true,false);
    return HeadlessStopResultSchema.parse({stopped:true,execution});
  }

  async close():Promise<void>{
    this.closed=true;
    const active=this.active;
    if(active)await this.terminateActive(active,false,false);
    await this.output.flush();
  }
}
