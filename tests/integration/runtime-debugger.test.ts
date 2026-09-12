import {expect,it} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {runtimeHarness,waitFor} from './helpers/runtime-harness.js';
it('controls a real run, inspects canonical properties, pauses and persists native diagnostics',async()=>{
  const h=await runtimeHarness();
  const call=async(name:string,args:Record<string,unknown>={})=>{
    const r=await h.client.callTool({name,arguments:args});
    if(r.isError)throw new Error(JSON.stringify(r.structuredContent??r.content));
    return r.structuredContent as any;
  };
  try {
    const started=await call('project.run');expect(started.state).toBe('running');expect(started.connected).toBe(true);
    const duplicate=await h.client.callTool({name:'project.run',arguments:{}});expect(duplicate.structuredContent).toMatchObject({error:{code:'RUNTIME_ALREADY_RUNNING'}});
    const tree=await call('runtime.scene_tree');expect(JSON.stringify(tree)).toContain('/root/Main');expect(JSON.stringify(tree)).not.toContain('GodotMcpRuntime');
    const prop=await call('runtime.get_property',{node_path:'/root/Main',property:'position'});
    expect(prop.value).toEqual({type:'Vector2',value:{x:12,y:24}});
    expect((await call('runtime.pause')).state).toBe('paused');
    const before=await call('runtime.get_property',{node_path:'/root/Main',property:'counter'});
    await new Promise(r=>setTimeout(r,150));
    expect((await call('runtime.get_property',{node_path:'/root/Main',property:'counter'})).value).toEqual(before.value);
    expect((await call('runtime.resume')).state).toBe('running');
    const perf=await call('debug.performance');expect(perf.nodeCount).toBeGreaterThan(0);
    const baseline=await call('performance.snapshot',{samples:2,intervalMs:10,label:'runtime baseline'});
    const candidate=await call('performance.snapshot',{samples:2,intervalMs:10,label:'runtime candidate'});
    const budget=await call('performance.compare',{baselineId:baseline.id,candidateId:candidate.id,budgets:{maxFpsDropRatio:10,maxFrameTimeIncreaseRatio:10,maxNodeIncreaseRatio:10,maxObjectIncreaseRatio:10}});
    expect(budget).toMatchObject({mode:'relative',passed:true});
    expect(baseline.sampleCount).toBe(2);
    await waitFor(async()=>JSON.stringify(await call('debug.output')).includes('RUNTIME_OUTPUT'));
    expect(JSON.stringify(await call('debug.errors'))).toContain('RUNTIME_ERROR');
    expect(JSON.stringify(await call('debug.warnings'))).toContain('RUNTIME_WARNING');
    expect((await call('project.stop')).stopped).toBe(true);
    expect((await call('runtime.stop')).stopped).toBe(false);
    const history=await call('debug.output',{run_id:started.runId});expect(history.entries.length).toBeGreaterThan(0);
    const alt=await call('project.run_scene',{path:'res://alternate.tscn'});expect(alt.runId).not.toBe(started.runId);
    const restarted=await call('runtime.restart');expect(restarted.runId).not.toBe(alt.runId);expect(restarted.scenePath).toBe('res://alternate.tscn');
    await call('project.stop');
    const result=await call('session.manifest');expect(result.manifest.runtimeRuns).toHaveLength(3);
    const file=path.join(h.root,'.godot-mcp/sessions',result.manifest.sessionId,result.manifest.runtimeRuns[0].logPath);
    expect(await readFile(file,'utf8')).toContain('RUNTIME_OUTPUT');
    expect(h.logs()).not.toMatch(/SCRIPT ERROR: Parse Error/);
  }finally{await h.close();}
},90000);

it('refuses to stop or replace a game launched outside the MCP session',async()=>{
 const h=await runtimeHarness({manual:true});
 try{
  await waitFor(async()=>(await h.client.callTool({name:'runtime.status',arguments:{}})).structuredContent?.ownership==='external');
  const stopped=await h.client.callTool({name:'project.stop',arguments:{}});expect(stopped.structuredContent).toMatchObject({error:{code:'RUNTIME_NOT_OWNED'}});
  const started=await h.client.callTool({name:'project.run',arguments:{}});expect(started.structuredContent).toMatchObject({error:{code:'RUNTIME_ALREADY_RUNNING'}});
  expect((await h.client.callTool({name:'runtime.status',arguments:{}})).structuredContent?.ownership).toBe('external');
 }finally{await h.close();}
},30000);

it('does not transfer ownership to a later manual game after an owned run stops',async()=>{
 const h=await runtimeHarness({manualAfterStop:true});
 try{
  expect((await h.client.callTool({name:'project.run',arguments:{}})).isError).not.toBe(true);
  expect((await h.client.callTool({name:'project.stop',arguments:{}})).structuredContent).toMatchObject({stopped:true});
  await writeFile(path.join(h.root,'.godot-mcp/start-test-game'),'start');
  await waitFor(async()=>(await h.client.callTool({name:'runtime.status',arguments:{}})).structuredContent?.ownership==='external',5000);
  expect((await h.client.callTool({name:'project.stop',arguments:{}})).structuredContent).toMatchObject({error:{code:'RUNTIME_NOT_OWNED'}});
 }finally{await h.close();}
},30000);

it('distinguishes debugger break from SceneTree pause and still permits stop',async()=>{
 const h=await runtimeHarness({breakAfterReady:true});
 try{
  const start=await h.client.callTool({name:'project.run',arguments:{}});expect(start.isError).not.toBe(true);
  await waitFor(async()=>(await h.client.callTool({name:'runtime.status',arguments:{}})).structuredContent?.state==='breaked');
  const read=await h.client.callTool({name:'runtime.get_property',arguments:{node_path:'/root/Main',property:'counter'}});
  expect(read.structuredContent).toMatchObject({error:{code:'RUNTIME_BREAKED'}});
  const stop=await h.client.callTool({name:'project.stop',arguments:{}});expect(stop.structuredContent).toMatchObject({stopped:true});
 }finally{await h.close();}
},30000);

it('stops its owned runtime and records endedAt on MCP stdin closure',async()=>{
 const h=await runtimeHarness();
 try{
  expect((await h.client.callTool({name:'project.run',arguments:{}})).isError).not.toBe(true);
  const response=await h.client.callTool({name:'session.manifest',arguments:{}});const id=(response.structuredContent?.manifest as any).sessionId;
  const file=path.join(h.root,'.godot-mcp/sessions',id,'manifest.json');
  await h.client.close();
  await waitFor(async()=>JSON.parse(await readFile(file,'utf8')).endedAt!==null,5000);
  expect(JSON.parse(await readFile(file,'utf8')).runtimeRuns[0]).toMatchObject({state:'stopped',endedAt:expect.any(String)});
 }finally{await h.close();}
},30000);
