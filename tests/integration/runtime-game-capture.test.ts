import {expect,it} from 'vitest';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';
import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {runtimeHarness,waitFor} from './helpers/runtime-harness.js';
it('persists the game viewport through multiple native debugger chunks',async()=>{
 const h=await runtimeHarness({sceneCamera:true});const files:string[]=[];let width=0;
 try{
  const started=await h.client.callTool({name:'project.run',arguments:{}});expect(started.isError).not.toBe(true);
  const result=await h.client.callTool({name:'visual.capture_game',arguments:{label:'live_game',checkpoint:true}});
  expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);
  const value=result.structuredContent as any;expect(value.screenshot).toMatchObject({type:'game',runId:started.structuredContent?.runId});
  width=value.screenshot.width;
  const file=path.join(h.root,'.godot-mcp/sessions',value.sessionId,value.screenshot.path);files.push(file);
  const bytes=await readFile(file);expect(bytes.length).toBeGreaterThan(65536);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(value.screenshot.sha256);
  const image=result.content.find(c=>c.type==='image');expect(image?.type).toBe('image');if(image?.type==='image')expect(Buffer.from(image.data,'base64')).toEqual(bytes);
  const sceneBefore=await readFile(path.join(h.root,'main.tscn'));
  const framed=await h.client.callTool({name:'visual.capture_game',arguments:{
    label:'closeup',framing:{center:{x:120,y:120},zoom:{x:2,y:2}}
  }});
  expect(framed.isError,JSON.stringify(framed.structuredContent)).not.toBe(true);
  expect(framed.structuredContent?.screenshot).toMatchObject({framing:{center:{x:120,y:120},zoom:{x:2,y:2}}});
  expect(framed.structuredContent?.screenshot?.sha256).not.toBe(value.screenshot.sha256);
  const restored=await h.client.callTool({name:'visual.capture_game',arguments:{label:'restored'}});
  expect(restored.isError,JSON.stringify(restored.structuredContent)).not.toBe(true);
  expect(restored.structuredContent?.screenshot?.sha256).toBe(value.screenshot.sha256);
  expect(await readFile(path.join(h.root,'main.tscn'))).toEqual(sceneBefore);
  await h.client.callTool({name:'runtime.pause',arguments:{}});
  const paused=await h.client.callTool({name:'visual.capture_game',arguments:{label:'paused'}});expect(paused.isError,JSON.stringify(paused.structuredContent)).not.toBe(true);
  await h.client.callTool({name:'project.stop',arguments:{}});
  const stopped=await h.client.callTool({name:'visual.capture_game',arguments:{}});expect(stopped.isError).toBe(true);
 }finally{await h.close();}
 const checked=spawnSync(h.godot,['--headless','--path',h.root,'--script',path.resolve('tests/integration/helpers/verify_png.gd'),'--',...files],{encoding:'utf8',windowsHide:true,timeout:30000});
 expect(checked.status,checked.stderr).toBe(0);const stats=JSON.parse(checked.stdout.split(/\r?\n/).find(l=>l.startsWith('PNG_STATS='))!.slice(10));
 expect(stats[0].blue).toBeGreaterThan(10000);expect(stats[0].width).toBe(width);
 await writeFile(path.join(h.root,'capture-evidence.json'),JSON.stringify({files,stats},null,2));
},60000);

it('restores the game camera after a framed capture fails',async()=>{
 const h=await runtimeHarness({failFramedCapture:true});
 try{
  const sceneBefore=await readFile(path.join(h.root,'main.tscn'));
  expect((await h.client.callTool({name:'project.run',arguments:{}})).isError).not.toBe(true);
  const baseline=await h.client.callTool({name:'visual.capture_game',arguments:{label:'baseline'}});
  expect(baseline.isError).not.toBe(true);
  await writeFile(path.join(h.root,'.godot-mcp/force-capture-fail'),'fail once');
  const failed=await h.client.callTool({name:'visual.capture_game',arguments:{
    framing:{center:{x:120,y:120},zoom:{x:2,y:2}}
  }});
  expect(failed.structuredContent).toMatchObject({error:{code:'CAPTURE_FAILED'}});
  const restored=await h.client.callTool({name:'visual.capture_game',arguments:{label:'after_failure'}});
  expect(restored.isError,JSON.stringify(restored.structuredContent)).not.toBe(true);
  expect(restored.structuredContent?.screenshot?.sha256).toBe(baseline.structuredContent?.screenshot?.sha256);
  expect(await readFile(path.join(h.root,'main.tscn'))).toEqual(sceneBefore);
 }finally{await h.close();}
},60000);

it('cancels a native capture in progress when stop uses the control lane',async()=>{
 const h=await runtimeHarness({slowCapture:true});
 try{
  expect((await h.client.callTool({name:'project.run',arguments:{}})).isError).not.toBe(true);
  const capture=h.client.callTool({name:'visual.capture_game',arguments:{}});
  await waitFor(async()=>{try{await readFile(path.join(h.root,'.godot-mcp/capture-started'));return true;}catch{return false;}});
  const begin=Date.now();const stopped=await h.client.callTool({name:'project.stop',arguments:{}});
  expect(stopped.structuredContent).toMatchObject({stopped:true});expect(Date.now()-begin).toBeLessThan(3000);
  const result=await capture;expect(result.isError).toBe(true);
  const manifest=(await h.client.callTool({name:'session.manifest',arguments:{}})).structuredContent?.manifest as any;
  expect(manifest.screenshots).toHaveLength(0);
 }finally{await h.close();}
},30000);
