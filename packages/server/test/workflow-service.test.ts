import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {expect,it} from 'vitest';
import {NO_RUNTIME_FEATURES,type DiagnosticEntry,type RuntimeStatus} from '@godot-mcp/protocol';
import {DiagnosticStore} from '../src/runtime/diagnostic-store.js';
import {createSession} from '../src/session/session.js';
import {SessionStore} from '../src/session/session-store.js';
import {WorkflowService} from '../src/workflow/workflow-service.js';

it('returns the newest bounded diagnostic tail with the true cursor',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-workflow-tail-'));
  const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);
  const store=new DiagnosticStore(sessions,session.id);const runId='123e4567-e89b-42d3-a456-426614174000';store.register(runId);
  const entries=Array.from({length:5},(_,i)=>({sequence:i+1,runId,timestamp:new Date(1700000000000+i).toISOString(),kind:'output' as const,stream:'stdout' as const,message:`line-${i+1}`,file:null,line:null,frames:[],truncated:false}));
  await store.append({runId,entries,dropped:0});
  expect(store.tail(runId,2)).toMatchObject({nextCursor:5,entries:[{sequence:4},{sequence:5}]});
});

it('persists a baseline and returns only post-baseline workflow changes',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-workflow-service-'));
  const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);
  let scene={path:'res://main.tscn',root_name:'Main',root_type:'Node2D'};
  let status:RuntimeStatus={state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:{...NO_RUNTIME_FEATURES},errorCode:null};
  let tail:any=null;
  const runtime={
    status:async()=>status,
    tailDiagnostics:async()=>tail,
    query:async()=>({runId:status.runId,entries:[],nextCursor:0,oldestAvailable:1,dropped:0,truncated:false})
  } as any;
  const visual={capture:async()=>{throw new Error('not requested');}} as any;
  const bridge={connected:true,rpc:{call:async(method:string)=>{if(method==='editor.get_active_scene')return scene;throw new Error(method);}}} as any;
  const workflow=new WorkflowService(session,sessions,bridge,runtime,visual);
  const first=await workflow.snapshot({label:'before',capture:'none',viewport_index:0,checkpoint:true,diagnostic_limit:100});

  const runId='123e4567-e89b-42d3-a456-426614174001';
  status={state:'running',runId,scenePath:'res://main.tscn',connected:true,ownership:'session',features:{...NO_RUNTIME_FEATURES,diagnostics:true},errorCode:null};
  const diagnostic:DiagnosticEntry={sequence:1,runId,timestamp:new Date().toISOString(),kind:'warning',stream:'stderr',message:'changed',file:null,line:null,frames:[],truncated:false};
  tail={runId,entries:[diagnostic],nextCursor:1,oldestAvailable:1,dropped:0,truncated:false};
  scene={...scene,root_name:'Changed'};
  const screenshot={id:'123e4567-e89b-42d3-a456-426614174002',sequence:1,type:'game' as const,runId,
    path:'screenshots/game/0001_changed.png',scene:'res://main.tscn',reason:'after_visual_change' as const,label:'changed',transaction:null,
    timestamp:new Date().toISOString(),width:32,height:32,byteLength:128,sha256:'a'.repeat(64),viewportIndex:null};
  await sessions.update(session.id,m=>({...m,nextScreenshotSequence:2,screenshots:[...m.screenshots,screenshot],
    errors:[...m.errors,{timestamp:new Date().toISOString(),tool:'fixture',code:'FIXTURE_WARNING',message:'changed'}],
    runtimeRuns:[...m.runtimeRuns,{runId,scenePath:'res://main.tscn',startedAt:new Date().toISOString(),endedAt:null,state:'running',logPath:`logs/runtime/${runId}.jsonl`,diagnosticsComplete:false,persistenceTruncated:false}]}));

  const delta=await workflow.diffSince({snapshot_id:first.snapshot.id,diagnostic_limit:100});
  expect(delta.activeScene.changed).toBe(true);
  expect(delta.runtime.runChanged).toBe(true);
  expect(delta.diagnostics.entries).toEqual([diagnostic]);
  expect(delta.screenshots).toEqual([screenshot]);
  expect(delta.errors).toHaveLength(1);
  expect(delta.runtimeRuns).toHaveLength(1);
});

it('run_check never replaces an external runtime and restarts an owned runtime',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-workflow-runcheck-'));
  const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);
  const runId='123e4567-e89b-42d3-a456-426614174010';
  let status:RuntimeStatus={state:'running',runId,scenePath:'res://manual.tscn',connected:true,ownership:'external',features:{...NO_RUNTIME_FEATURES},errorCode:null};
  let stops=0,starts=0;
  const runtime={
    status:async()=>status,tailDiagnostics:async()=>null,query:async()=>({runId,entries:[],nextCursor:0,oldestAvailable:1,dropped:0,truncated:false}),
    stop:async()=>{stops++;status={...status,state:'stopped',connected:false,ownership:'none'};return {stopped:true,runId};},
    run:async()=>{starts++;status={state:'running',runId,scenePath:'res://main.tscn',connected:true,ownership:'session',features:{...NO_RUNTIME_FEATURES,gameCapture:true},errorCode:null};return status;},
    request:async()=>({fps:60})
  } as any;
  const visual={capture:async()=>({result:{screenshot:null},data:'png'})} as any;
  const bridge={connected:true,rpc:{call:async()=>({path:'res://main.tscn',root_name:'Main',root_type:'Node2D'})}} as any;
  const workflow=new WorkflowService(session,sessions,bridge,runtime,visual);
  await expect(workflow.runCheck({target:'current',label:'check',capture:false,checkpoint:true,settle_ms:0,diagnostic_limit:100,include_performance:false}))
    .rejects.toMatchObject({code:'RUNTIME_NOT_OWNED'});
  expect(stops).toBe(0);expect(starts).toBe(0);

  status={...status,ownership:'session'};
  const checked=await workflow.runCheck({target:'current',label:'check',capture:false,checkpoint:true,settle_ms:0,diagnostic_limit:100,include_performance:false});
  expect(stops).toBe(1);expect(starts).toBe(1);expect(checked.result.verdict).toBe('pass');
});

it('run_check fails on native errors and keeps warnings non-fatal',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-workflow-verdict-'));
  const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);
  const runId='123e4567-e89b-42d3-a456-426614174011';
  const base={sequence:1,runId,timestamp:new Date().toISOString(),stream:'stderr' as const,file:null,line:null,frames:[],truncated:false};
  let entries:DiagnosticEntry[]=[{...base,kind:'warning',message:'warn'}];
  const status:RuntimeStatus={state:'running',runId,scenePath:'res://main.tscn',connected:true,ownership:'session',features:{...NO_RUNTIME_FEATURES,diagnostics:true},errorCode:null};
  const runtime={status:async()=>({state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:NO_RUNTIME_FEATURES,errorCode:null}),
    run:async()=>status,stop:async()=>({stopped:true,runId:null}),request:async()=>({}),query:async()=>({runId,entries,nextCursor:entries.length,oldestAvailable:1,dropped:0,truncated:false}),
    tailDiagnostics:async()=>({runId,entries,nextCursor:entries.length,oldestAvailable:1,dropped:0,truncated:false})} as any;
  // After launch, subsequent status calls must observe the running fixture.
  let launched=false;runtime.status=async()=>launched?status:{state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:NO_RUNTIME_FEATURES,errorCode:null};
  runtime.run=async()=>{launched=true;return status;};
  const workflow=new WorkflowService(session,sessions,{connected:true,rpc:{call:async()=>({path:'res://main.tscn',root_name:'Main',root_type:'Node2D'})}} as any,runtime,{capture:async()=>{throw new Error('not requested');}} as any);
  expect((await workflow.runCheck({target:'current',label:'warning',capture:false,checkpoint:true,settle_ms:0,diagnostic_limit:100,include_performance:false})).result.verdict).toBe('pass');
  launched=false;entries=[{...base,sequence:2,kind:'error',message:'boom'}];
  expect((await workflow.runCheck({target:'current',label:'error',capture:false,checkpoint:true,settle_ms:0,diagnostic_limit:100,include_performance:false})).result.verdict).toBe('fail');
});
