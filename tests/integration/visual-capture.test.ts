import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {CaptureResultSchema,SessionManifestSchema} from '../../packages/protocol/src/index.js';
import {visualHarness,waitFor,startClient} from './helpers/visual-harness.js';

it('captures real 2D and 3D pixels, checkpoints and persistent session closure through MCP',async()=>{
  if(process.platform!=='win32' || process.env.GODOT_VISUAL_INTEGRATION!=='1' || !process.env.GODOT_BIN) {
    throw new Error('Windows, GODOT_BIN and GODOT_VISUAL_INTEGRATION=1 are required; this tier cannot pass by skipping');
  }
  const godotBin=process.env.GODOT_BIN;
  const h=await visualHarness(godotBin);
  const files:string[]=[];
  let manifestFile='';
  try {
    await waitFor(async()=>{
      const r=await h.client.callTool({name:'session.status',arguments:{}});
      return r.structuredContent?.editorConnected===true;
    });
    await waitFor(async()=>!!(await h.client.callTool({name:'scene.get_tree',arguments:{}})).structuredContent?.root);
    const capture=async(name:string,label:string)=>{
      const r=await h.client.callTool({name,arguments:{label,checkpoint:true}});
      expect(r.isError,JSON.stringify(r.structuredContent)).not.toBe(true);
      const value=CaptureResultSchema.parse(r.structuredContent);
      const file=path.join(h.root,'.godot-mcp/sessions',value.sessionId,value.screenshot.path);
      manifestFile=path.join(h.root,'.godot-mcp/sessions',value.sessionId,'manifest.json');
      const bytes=await readFile(file);
      if(name.endsWith('2d'))expect(bytes.length).toBeGreaterThan(65536);
      const image=r.content.find(c=>c.type==='image');
      expect(image?.type).toBe('image');
      if(image?.type==='image')expect(Buffer.from(image.data,'base64')).toEqual(bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(value.screenshot.sha256);
      expect(value.checkpoint?.screenshotId).toBe(value.screenshot.id);
      files.push(file);
      return value;
    };
    const initial2d=await capture('visual.capture_viewport_2d','initial_2d');
    const opened=await h.client.callTool({name:'scene.open',arguments:{path:'res://main_3d.tscn'}});
    expect(opened.isError).not.toBe(true);
    await capture('visual.capture_viewport_3d','initial_3d');
    const hidden=await h.client.callTool({name:'visual.capture_viewport_3d',arguments:{viewport_index:3}});
    expect(hidden.structuredContent).toMatchObject({error:{code:'VIEWPORT_UNAVAILABLE'}});
    await h.client.callTool({name:'scene.open',arguments:{path:'res://main_2d.tscn'}});
    const changed=await h.client.callTool({name:'node.set_property',arguments:{node_path:'/Main2D/Red',property:'color',value:{r:0,g:0,b:1,a:1}}});
    expect(changed.isError,JSON.stringify(changed.structuredContent)).not.toBe(true);
    const changed2d=await capture('visual.capture_viewport_2d','changed_2d');
    const comparison=await h.client.callTool({name:'visual.compare',arguments:{baseline:{sessionId:initial2d.sessionId,screenshotId:initial2d.screenshot.id},candidate:{sessionId:changed2d.sessionId,screenshotId:changed2d.screenshot.id},pixelThreshold:5,maxChangedPixelRatio:0}});
    expect(comparison.isError,JSON.stringify(comparison.structuredContent)).not.toBe(true);
    expect(comparison.structuredContent).toMatchObject({complete:true,passed:false,width:initial2d.screenshot.width,height:initial2d.screenshot.height});
    expect((comparison.structuredContent as {changedPixels:number}).changedPixels).toBeGreaterThan(0);
    await expect(readFile(path.join(String(comparison.structuredContent?.artifactPath),'diff.png'))).resolves.toBeDefined();
    const response=await h.client.callTool({name:'session.manifest',arguments:{}});
    const manifest=SessionManifestSchema.parse(response.structuredContent?.manifest);
    expect(manifest.screenshots.map(s=>s.sequence)).toEqual([1,2,3]);
    expect(manifest.checkpoints).toHaveLength(3);
    expect(manifest.godotVersion).toContain('4.6.3');
    await h.client.close();
    await waitFor(async()=>JSON.parse(await readFile(manifestFile,'utf8')).endedAt!==null,5000);
    const next=await startClient(h.root);
    try {
      const fresh=await next.callTool({name:'session.manifest',arguments:{}});
      expect(fresh.structuredContent?.manifest).toMatchObject({screenshots:[]});
      expect((fresh.structuredContent?.manifest as {sessionId:string}).sessionId).not.toBe(manifest.sessionId);
      await waitFor(async()=>(await next.callTool({name:'session.status',arguments:{}})).structuredContent?.editorConnected===true);
      const reconnected=await next.callTool({name:'visual.capture_viewport_2d',arguments:{label:'reconnected'}});
      expect(reconnected.isError,JSON.stringify(reconnected.structuredContent)).not.toBe(true);
      const saved=CaptureResultSchema.parse(reconnected.structuredContent);
      expect(saved.screenshot.sequence).toBe(1);
      expect(saved.screenshot.scene).toBe('res://main_2d.tscn');
    } finally {await next.close();}
    await h.stopEditor();
    const checked=spawnSync(godotBin,['--headless','--path',h.root,'--script',path.resolve('tests/integration/helpers/verify_png.gd'),'--',...files],{encoding:'utf8',windowsHide:true,timeout:30000});
    expect(checked.status,checked.stderr).toBe(0);
    const line=checked.stdout.split(/\r?\n/).find(l=>l.startsWith('PNG_STATS='));
    const stats=JSON.parse(line!.slice('PNG_STATS='.length));
    expect(stats[0].red).toBeGreaterThan(500);expect(stats[0].green).toBeGreaterThan(500);
    expect(stats[1].red).toBeGreaterThan(100);expect(stats[1].green).toBeGreaterThan(100);
    expect(stats[2].blue).toBeGreaterThan(500);expect(stats[2].red).toBeLessThan(stats[0].red/2);
    for(const file of files)expect((await readFile(file)).length).toBeGreaterThan(0);
    expect(h.logs()).not.toMatch(/SCRIPT ERROR|Parse Error/);
    await writeFile(path.join(h.root,'evidence.json'),JSON.stringify({manifestFile,files,stats},null,2));
    console.info(`Visual evidence retained: ${h.root}`);
  } finally {await h.close();}
},60000);

it('reports an absent edited scene without creating a screenshot',async()=>{
  if(process.platform!=='win32' || process.env.GODOT_VISUAL_INTEGRATION!=='1' || !process.env.GODOT_BIN)throw new Error('Graphical integration prerequisites missing');
  const h=await visualHarness(process.env.GODOT_BIN,false);
  try {
    await waitFor(async()=>(await h.client.callTool({name:'session.status',arguments:{}})).structuredContent?.editorConnected===true);
    expect((await h.client.callTool({name:'scene.get_tree',arguments:{}})).structuredContent?.root).toBeNull();
    const result=await h.client.callTool({name:'visual.capture_viewport_2d',arguments:{}});
    expect(result.structuredContent).toMatchObject({error:{code:'NO_OPEN_SCENE'}});
    expect((await h.client.callTool({name:'session.manifest',arguments:{}})).structuredContent?.manifest).toMatchObject({screenshots:[]});
  } finally {await h.close();}
},30000);
