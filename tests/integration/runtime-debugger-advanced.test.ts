import {access,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,it} from 'vitest';
import {runtimeHarness,waitFor} from './helpers/runtime-harness.js';

async function markerLines(root:string):Promise<Record<string,number>>{
  const lines=(await readFile(path.join(root,'debug_target.gd'),'utf8')).split(/\r?\n/);
  const result:Record<string,number>={};
  for(const marker of ['MCP_BP_ENTRY','MCP_STEP_OVER','MCP_STEP_INTO','MCP_STEP_OUT','MCP_STEP_OUT_RETURN']){
    const index=lines.findIndex(line=>line.includes(marker));
    if(index<0)throw new Error(`Missing debugger fixture marker ${marker}`);
    result[marker]=index+1;
  }
  return result;
}

function errorCode(result:any):string|null{return result?.structuredContent?.error?.code??null;}
async function waitForDebuggerReady(client:any):Promise<void>{
  let last:unknown=null;
  try{
    await waitFor(async()=>{
      const result=await client.callTool({name:'debug.stack',arguments:{}});
      last=result.structuredContent??result.content;
      return errorCode(result)==='RUNTIME_NOT_BREAKED';
    },15000);
  }catch(error){
    throw new Error(`Debugger readiness deadline exceeded; last debug.stack=${JSON.stringify(last)}`,{cause:error});
  }
}
async function waitForStack(client:any,predicate:(stack:any)=>boolean,timeout=15000):Promise<any>{
  let observed:any=null;
  try{
    await waitFor(async()=>{
      const result=await client.callTool({name:'debug.stack',arguments:{}});
      observed=result.structuredContent??result.content;
      if(result.isError)return false;
      return predicate(observed);
    },timeout);
  }catch(error){
    throw new Error(`Debugger stack deadline exceeded; last debug.stack=${JSON.stringify(observed)}`,{cause:error});
  }
  return observed;
}
async function call(client:any,name:string,args:Record<string,unknown>={}):Promise<any>{
  const result=await client.callTool({name,arguments:args});
  if(result.isError)throw new Error(`${name}: ${JSON.stringify(result.structuredContent??result.content)}`);
  return result.structuredContent;
}
async function trigger(root:string):Promise<void>{await writeFile(path.join(root,'.godot-mcp','start-debug-flow'),'go');}

it('drives real Godot DAP stack, variables, lazy expansion, stepping, stale refs, and breakpoint reapply',async()=>{
  const h=await runtimeHarness({noRuntimeError:true});const lines=await markerLines(h.root);
  try{
    await call(h.client,'debug.breakpoint.set',{script_path:'res://debug_target.gd',line:lines.MCP_BP_ENTRY});
    await call(h.client,'project.run');await waitForDebuggerReady(h.client);await trigger(h.root);
    const entry=await waitForStack(h.client,stack=>stack.frames?.[0]?.scriptPath==='res://debug_target.gd'&&stack.frames[0].line===lines.MCP_BP_ENTRY);
    const vars=await call(h.client,'debug.variables',{frame_id:entry.frames[0].frameId});
    const flattened=vars.scopes.flatMap((scope:any)=>scope.variables);
    expect(flattened).toEqual(expect.arrayContaining([expect.objectContaining({name:'local_value',value:'42'})]));
    const nested=flattened.find((value:any)=>value.name==='nested');expect(nested?.variableRef).toMatch(/^[0-9a-f-]{36}$/);
    const expanded=await call(h.client,'debug.expand',{variable_ref:nested.variableRef,start:0,limit:100});
    expect(expanded.entries.map((value:any)=>value.name)).toEqual(expect.arrayContaining(['numbers','meta']));
    await call(h.client,'debug.continue');
    await waitFor(async()=>errorCode(await h.client.callTool({name:'debug.stack',arguments:{}}))==='RUNTIME_NOT_BREAKED');
    await call(h.client,'debug.breakpoint.remove',{script_path:'res://debug_target.gd',line:lines.MCP_BP_ENTRY});

    await call(h.client,'debug.breakpoint.set',{script_path:'res://debug_target.gd',line:lines.MCP_STEP_OVER});
    await call(h.client,'runtime.restart');await waitForDebuggerReady(h.client);await trigger(h.root);
    const beforeStep=await waitForStack(h.client,stack=>stack.frames?.[0]?.line===lines.MCP_STEP_OVER);
    await call(h.client,'debug.step_over');
    const afterStep=await waitForStack(h.client,stack=>stack.breakId!==beforeStep.breakId);
    const stale=await h.client.callTool({name:'debug.variables',arguments:{frame_id:beforeStep.frames[0].frameId}});
    expect(stale.structuredContent).toMatchObject({error:{code:'STALE_DEBUG_REFERENCE'}});
    expect(afterStep.frames[0].scriptPath).toBe('res://debug_target.gd');
    await call(h.client,'debug.continue');
    await call(h.client,'debug.breakpoint.remove',{script_path:'res://debug_target.gd',line:lines.MCP_STEP_OVER});

    await call(h.client,'debug.breakpoint.set',{script_path:'res://debug_target.gd',line:lines.MCP_STEP_INTO});
    await call(h.client,'runtime.restart');await waitForDebuggerReady(h.client);await trigger(h.root);
    await waitForStack(h.client,stack=>stack.frames?.[0]?.line===lines.MCP_STEP_INTO);
    await call(h.client,'debug.step_into');
    await waitForStack(h.client,stack=>stack.frames?.[0]?.name==='_level_two');
    await call(h.client,'debug.step_out');
    await waitForStack(h.client,stack=>stack.frames?.[0]?.name==='_level_one'&&stack.frames[0].line===lines.MCP_STEP_OUT_RETURN);
    await call(h.client,'debug.continue');
    await call(h.client,'debug.breakpoint.remove',{script_path:'res://debug_target.gd',line:lines.MCP_STEP_INTO});

    // Reapply gate: set once, stop/start, then hit again without another set call.
    await call(h.client,'debug.breakpoint.set',{script_path:'res://debug_target.gd',line:lines.MCP_BP_ENTRY});
    await call(h.client,'project.stop');await call(h.client,'project.run');await waitForDebuggerReady(h.client);await trigger(h.root);
    await waitForStack(h.client,stack=>stack.frames?.[0]?.line===lines.MCP_BP_ENTRY);
    await call(h.client,'debug.continue');await call(h.client,'project.stop');
    await call(h.client,'project.run');await waitForDebuggerReady(h.client);await trigger(h.root);
    await waitForStack(h.client,stack=>stack.frames?.[0]?.line===lines.MCP_BP_ENTRY);
    await call(h.client,'debug.continue');
    await call(h.client,'debug.breakpoint.remove',{script_path:'res://debug_target.gd',line:lines.MCP_BP_ENTRY});
  }finally{await h.close();}
},120000);

it('preserves a real manual editor breakpoint while session cleanup removes only the MCP-owned breakpoint',async()=>{
  const h=await runtimeHarness({manualBreakpoint:true,noRuntimeError:true});const lines=await markerLines(h.root);
  const breakpointFile=path.join(h.root,'.godot-mcp','breakpoints.json');
  try{
    await call(h.client,'debug.breakpoint.set',{script_path:'res://debug_target.gd',line:lines.MCP_STEP_OUT});
    await call(h.client,'project.run');await waitForDebuggerReady(h.client);
    await writeFile(path.join(h.root,'.godot-mcp','manual-breakpoint.json'),JSON.stringify({script_path:'res://debug_target.gd',line:lines.MCP_BP_ENTRY,enabled:true}));
    await rm(breakpointFile,{force:true});await writeFile(path.join(h.root,'.godot-mcp','dump-breakpoints'),'dump');
    try{
      await waitFor(async()=>{try{return (await readFile(breakpointFile,'utf8')).includes(`res://debug_target.gd:${lines.MCP_BP_ENTRY}`);}catch{return false;}});
    }catch(error){
      const stateFile=path.join(h.root,'.godot-mcp','manual-breakpoint-state.json');
      let state='missing';let inventory='missing';
      try{state=await readFile(stateFile,'utf8');}catch{}
      try{inventory=await readFile(breakpointFile,'utf8');}catch{}
      throw new Error(`Manual breakpoint fixture deadline exceeded; state=${state}; inventory=${inventory}`,{cause:error});
    }
    await trigger(h.root);
    const manual=await waitForStack(h.client,stack=>stack.frames?.[0]?.line===lines.MCP_BP_ENTRY);
    const vars=await call(h.client,'debug.variables',{frame_id:manual.frames[0].frameId});expect(vars.scopes.length).toBeGreaterThan(0);
    await call(h.client,'debug.continue');
    await waitForStack(h.client,stack=>stack.frames?.[0]?.line===lines.MCP_STEP_OUT);

    await h.closeClient();
    const descriptor=path.join(h.root,'.godot-mcp','runtime','bridge.json');
    await waitFor(async()=>{try{await access(descriptor);return false;}catch{return true;}},10000);
    await rm(breakpointFile,{force:true});await writeFile(path.join(h.root,'.godot-mcp','dump-breakpoints'),'dump');
    await waitFor(async()=>{try{await access(breakpointFile);return true;}catch{return false;}},5000);
    const persisted=await readFile(breakpointFile,'utf8');
    expect(persisted).toContain(`res://debug_target.gd:${lines.MCP_BP_ENTRY}`);
    expect(persisted).not.toContain(`res://debug_target.gd:${lines.MCP_STEP_OUT}`);
  }finally{await h.closeEditor();}
},90000);
