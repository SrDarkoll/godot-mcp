import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {expect,it,vi} from 'vitest';
import {RuntimeService} from '../src/runtime/runtime-service.js';
import {SessionStore} from '../src/session/session-store.js';import {createSession} from '../src/session/session.js';
import {NO_RUNTIME_FEATURES} from '@godot-mcp/protocol';
it('binds execution history to server-generated ids and preserves prior logs on stop',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-runs-'));const session=createSession(root);const store=new SessionStore(root);await store.create(session);
 let status:any={state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:NO_RUNTIME_FEATURES,errorCode:null};
 const bridge={connected:true,rpc:{call:async(method:string,params:any)=>{
  if(method==='runtime.status')return status;
  if(method==='runtime.start'){status={...status,state:'running',runId:params.runId,scenePath:'res://main.tscn',connected:true,ownership:'session',features:{...NO_RUNTIME_FEATURES,inspect:true}};return status;}
  if(method==='runtime.stop'){const id=status.runId;status={...status,state:'stopped',connected:false};return {stopped:true,runId:id};}
  throw new Error(method);
 }}};
 const service=new RuntimeService(session,store,bridge);
 const run=await service.run({target:'main'});expect(run.runId).toMatch(/^[a-f0-9-]{36}$/);
 await expect(service.run({target:'main'})).rejects.toMatchObject({code:'RUNTIME_ALREADY_RUNNING'});
 service.acceptEvent({type:'event',protocol:1,sessionId:session.id,sequence:1,event:'runtime.state',data:{...status,runId:'123e4567-e89b-42d3-a456-426614174000',state:'failed'}});
 expect((await service.status()).runId).toBe(run.runId);
 await service.stop();await service.flush();
 expect((await store.read(session.id)).runtimeRuns[0]).toMatchObject({runId:run.runId,state:'stopped',endedAt:expect.any(String)});
 bridge.connected=false;service.disconnect();expect((await service.status()).connected).toBe(false);
});
it('reports manifest publication failure rather than claiming a durable ready state',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-run-write-'));const session=createSession(root);const store=new SessionStore(root);await store.create(session);
 let spy:ReturnType<typeof vi.spyOn>|undefined;
 const bridge={connected:true,rpc:{call:async(method:string,params:any)=>{
  if(method==='runtime.status')return {state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:NO_RUNTIME_FEATURES,errorCode:null};
  spy=vi.spyOn(fs,'rename').mockRejectedValueOnce(new Error('disk full'));
  return {state:'running',runId:params.runId,scenePath:'res://main.tscn',connected:true,ownership:'session',features:NO_RUNTIME_FEATURES,errorCode:null};
 }}};
 const service=new RuntimeService(session,store,bridge);
 try{await expect(service.run({target:'main'})).rejects.toMatchObject({code:'MANIFEST_WRITE_FAILED'});}finally{spy?.mockRestore();}
});

it('ignores debugger breakpoint inventory events in RuntimeService',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-debug-event-'));const session=createSession(root);const store=new SessionStore(root);await store.create(session);
 const status:any={state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:NO_RUNTIME_FEATURES,errorCode:null};
 const append=vi.fn();
 const bridge={connected:true,rpc:{call:async(method:string)=>{if(method==='runtime.status')return status;throw new Error(method);}}};
 const service=new RuntimeService(session,store,bridge);
 vi.spyOn(service.diagnostics,'append').mockImplementation(append as any);
 service.acceptEvent({type:'event',protocol:1,sessionId:session.id,sequence:1,event:'debugger.breakpoints',data:{breakpoints:[{scriptPath:'res://player.gd',line:7}]}} as any);
 expect(await service.status()).toEqual(status);
 expect(append).not.toHaveBeenCalled();
});

it('publishes immutable lifecycle snapshots to subscribers and stops after unsubscribe',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-runtime-subscribe-'));const session=createSession(root);const store=new SessionStore(root);await store.create(session);
 let status:any={state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:NO_RUNTIME_FEATURES,errorCode:null};
 const bridge={connected:true,rpc:{call:async(method:string,params:any)=>{
  if(method==='runtime.status')return status;
  if(method==='runtime.start'){status={...status,state:'running',runId:params.runId,scenePath:'res://main.tscn',connected:true,ownership:'session'};return status;}
  if(method==='runtime.stop'){status={...status,state:'stopped',connected:false};return {stopped:true,runId:status.runId};}
  throw new Error(method);
 }}};
 const service=new RuntimeService(session,store,bridge);const seen:any[]=[];const unsubscribe=service.subscribe(value=>seen.push(value));
 const run=await service.run({target:'main'});
 service.acceptEvent({type:'event',protocol:1,sessionId:session.id,sequence:2,event:'runtime.state',data:{...run,state:'breaked'}});
 expect(seen.map(value=>value.state)).toEqual(['stopped','running','breaked']);
 seen[seen.length-1].state='tampered';expect(service.peek().state).toBe('breaked');
 unsubscribe();service.acceptEvent({type:'event',protocol:1,sessionId:session.id,sequence:3,event:'runtime.state',data:{...run,state:'running'}});
 expect(seen.map(value=>value.state)).toEqual(['stopped','running','tampered']);
});
