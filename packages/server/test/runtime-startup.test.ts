import {expect,it} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {NO_RUNTIME_FEATURES} from '@godot-mcp/protocol';
import {createSession} from '../src/session/session.js';
import {SessionStore} from '../src/session/session-store.js';
import {RuntimeService} from '../src/runtime/runtime-service.js';
import {BridgeRpcError} from '../src/bridge/rpc-router.js';
import {parseStartupLog} from '../src/runtime/startup-diagnostics.js';

it('retains native compiler locations without interpreting project FAIL output',()=>{
  const runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const parsed=parseStartupLog('CAMPUS_DETAIL FAIL 1 checks\nSCRIPT ERROR: Parse Error: Cannot infer a type.\n   at: GDScript::reload (res://bad.gd:7)\n',runId);
  expect(parsed.entries[0]).toMatchObject({kind:'output',message:'CAMPUS_DETAIL FAIL 1 checks'});
  expect(parsed.entries.find(entry=>entry.kind==='error')).toMatchObject({file:'res://bad.gd',line:7,source:'startup_log'});
});

it('keeps a failed launch log readable without a ready runtime connection',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-boot-'));
  const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);
  let runId:string|null=null;
  const bridge={connected:true,rpc:{call:async(method:string,params:any)=>{
    if(method==='runtime.status')return {state:runId?'failed':'stopped',runId,scenePath:'res://bad.tscn',connected:false,ownership:runId?'session':'none',features:{...NO_RUNTIME_FEATURES},errorCode:runId?'RUNTIME_START_TIMEOUT':null};
    if(method==='runtime.start'){
      runId=params.runId;
      await fs.writeFile(path.join(root,params.startupLogPath),'SCRIPT ERROR: Parse Error: Missing dependency.\n   at: GDScript::reload (res://bad.gd:3)\n');
      throw new BridgeRpcError('RUNTIME_START_TIMEOUT','Game did not become ready',{startup:{phase:'bridge_timeout',processState:'editor_playing',exitCode:null,logPath:params.startupLogPath}});
    }
    return {stopped:true,runId};
  }}};
  const runtime=new RuntimeService(session,sessions,bridge as any);
  await expect(runtime.run({target:'path',path:'res://bad.tscn'})).rejects.toMatchObject({code:'RUNTIME_START_TIMEOUT',details:{startup:{exitCode:null,phase:'bridge_timeout'}}});
  const errors=await runtime.query('error',{after:0,limit:100});
  expect(errors.entries).toContainEqual(expect.objectContaining({file:'res://bad.gd',line:3,source:'startup_log'}));
  expect((await runtime.tailDiagnostics())?.errorCount).toBe(1);
  expect((await sessions.read(session.id)).runtimeRuns[0]).toHaveProperty('startupLogPath');
  await runtime.close();
});
