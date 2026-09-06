import {spawn,type ChildProcess} from 'node:child_process';
import {cp,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {afterEach,describe,expect,test} from 'vitest';
import {initProject} from '../../packages/cli/src/init/init-project.js';
import {confirmFixtureOperation} from './helpers/confirm-fixture-operation.js';

const fixtureRoot=path.resolve('fixtures/empty-project');
const tempRoots:string[]=[];
const SPRITE_PNG_BASE64='iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAANUlEQVR42u3OsQ0AMAwCMP5/Os0PVMpiEDPOJNPsQwEAAAAAAACOAeX/JtUAAAAAAAAAzgEPKMv3eUpmLE8AAAAASUVORK5CYII=';

async function waitFor(predicate:()=>boolean|Promise<boolean>,timeoutMs:number):Promise<boolean>{
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    if(await predicate()) return true;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  return await predicate();
}
async function stopProcess(child:ChildProcess|null):Promise<void>{
  if(!child||child.exitCode!==null||child.signalCode!==null) return;
  child.kill();
  await Promise.race([
    new Promise<void>(resolve=>child.once('exit',()=>resolve())),
    new Promise<void>(resolve=>setTimeout(resolve,2000))
  ]);
  if(child.exitCode===null&&child.signalCode===null) child.kill('SIGKILL');
}
afterEach(async()=>{await Promise.all(tempRoots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

describe('Godot 2D power tools',()=>{
  test('authors persistent Node2D, Sprite2D, Camera2D, collision and parallax state with Undo/Redo',async()=>{
    const godotBin=process.env.GODOT_BIN;
    if(!godotBin) throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');
    const tempRoot=await mkdtemp(path.join(os.tmpdir(),'godot-mcp-2d-power-tools-'));
    tempRoots.push(tempRoot);
    await cp(fixtureRoot,tempRoot,{recursive:true});
    await writeFile(path.join(tempRoot,'sprite.png'),Buffer.from(SPRITE_PNG_BASE64,'base64'));
    await initProject({projectRoot:tempRoot,godotBin,enable:true});

    const serverEntry=path.resolve('packages/server/dist/index.js');
    const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry,'--project',tempRoot,'--bridge-port','0']});
    const client=new Client({name:'power2d-integration-test',version:'0.1.0'},{capabilities:{elicitation:{form:{}}}});
    await client.connect(transport);
    let godot:ChildProcess|null=null;
    const call=(name:string,args:Record<string,unknown>={})=>client.callTool({name,arguments:args});
    try{
      godot=spawn(godotBin,['--headless','--path',tempRoot,'--editor','res://main.tscn'],{stdio:'inherit',windowsHide:true});
      expect(await waitFor(async()=>((await call('session.status')).structuredContent as any)?.editorConnected===true,15000)).toBe(true);
      expect(await waitFor(async()=>!!((await call('scene.get_tree')).structuredContent as any)?.root,10000)).toBe(true);

      for(const [parent_path,type,name] of [
        ['/Main','Node2D','Actor'],
        ['/Main/Actor','Sprite2D','Sprite'],
        ['/Main','Camera2D','SceneCamera'],
        ['/Main','StaticBody2D','Body'],
        ['/Main/Body','CollisionShape2D','Collider'],
        ['/Main','Parallax2D','Background']
      ] as const){
        const created=await call('node.create',{parent_path,type,name});
        expect(created.isError,JSON.stringify(created.structuredContent)).not.toBe(true);
      }

      const transform=await call('node2d.set_transform',{
        node_path:'/Main/Actor',position:{x:100,y:50},rotation_degrees:30,scale:{x:1.5,y:2},skew_degrees:5
      });
      expect(transform.isError,JSON.stringify(transform.structuredContent)).not.toBe(true);
      expect(transform.structuredContent).toMatchObject({node_path:'/Main/Actor',type:'Node2D',position:{x:100,y:50},scale:{x:1.5,y:2}});
      expect((transform.structuredContent as any).rotation_degrees).toBeCloseTo(30,5);
      expect((transform.structuredContent as any).skew_degrees).toBeCloseTo(5,5);
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('node2d.inspect_transform',{node_path:'/Main/Actor'})).structuredContent as any).position).toEqual({x:0,y:0});
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});

      const missingTexture=await call('sprite2d.set_texture',{node_path:'/Main/Actor/Sprite',texture_path:'res://missing.png'});
      expect(missingTexture.isError).toBe(true);
      expect(missingTexture.structuredContent).toMatchObject({error:{code:'RESOURCE_NOT_FOUND'}});
      const texture=await call('sprite2d.set_texture',{node_path:'/Main/Actor/Sprite',texture_path:'res://sprite.png'});
      expect(texture.isError,JSON.stringify(texture.structuredContent)).not.toBe(true);
      expect(texture.structuredContent).toMatchObject({texture_path:'res://sprite.png'});

      const badFrame=await call('sprite2d.configure',{node_path:'/Main/Actor/Sprite',hframes:2,vframes:2,frame:4});
      expect(badFrame.isError).toBe(true);
      expect(badFrame.structuredContent).toMatchObject({error:{code:'FRAME_OUT_OF_RANGE'}});
      const sprite=await call('sprite2d.configure',{
        node_path:'/Main/Actor/Sprite',centered:false,offset:{x:3,y:4},flip_h:true,flip_v:false,
        hframes:2,vframes:2,frame_coords:{x:1,y:1},region_enabled:true,region_rect:{x:0,y:0,width:16,height:16},region_filter_clip_enabled:true
      });
      expect(sprite.isError,JSON.stringify(sprite.structuredContent)).not.toBe(true);
      expect(sprite.structuredContent).toMatchObject({
        texture_path:'res://sprite.png',centered:false,offset:{x:3,y:4},flip_h:true,hframes:2,vframes:2,frame:3,
        frame_coords:{x:1,y:1},region_enabled:true,region_rect:{x:0,y:0,width:16,height:16},region_filter_clip_enabled:true
      });

      const invalidZoom=await call('camera2d.configure',{node_path:'/Main/SceneCamera',zoom:{x:0,y:1}});
      expect(invalidZoom.isError).toBe(true);
      const invalidLimits=await call('camera2d.configure',{node_path:'/Main/SceneCamera',limit_left:20,limit_right:10});
      expect(invalidLimits.isError).toBe(true);
      expect(invalidLimits.structuredContent).toMatchObject({error:{code:'CAMERA_LIMITS_INVALID'}});
      const camera=await call('camera2d.configure',{
        node_path:'/Main/SceneCamera',enabled:true,zoom:{x:2,y:2},offset:{x:8,y:-4},ignore_rotation:false,
        limit_enabled:true,limit_smoothed:true,limit_left:0,limit_top:0,limit_right:640,limit_bottom:360,
        position_smoothing_enabled:true,position_smoothing_speed:8,rotation_smoothing_enabled:true,rotation_smoothing_speed:6,
        drag_horizontal_enabled:true,drag_vertical_enabled:true,drag_left_margin:0.1,drag_top_margin:0.15,drag_right_margin:0.2,drag_bottom_margin:0.25
      });
      expect(camera.isError,JSON.stringify(camera.structuredContent)).not.toBe(true);
      expect(camera.structuredContent).toMatchObject({
        zoom:{x:2,y:2},offset:{x:8,y:-4},limit_left:0,limit_top:0,limit_right:640,limit_bottom:360,
        position_smoothing_enabled:true,rotation_smoothing_enabled:true,drag_horizontal_enabled:true,drag_vertical_enabled:true
      });
      expect((camera.structuredContent as any).drag_left_margin).toBeCloseTo(0.1,5);

      const rectangle=await call('collision2d.set_shape',{node_path:'/Main/Body/Collider',shape:{kind:'rectangle',size:{x:64,y:24}}});
      expect(rectangle.isError,JSON.stringify(rectangle.structuredContent)).not.toBe(true);
      expect((rectangle.structuredContent as any).shape).toMatchObject({kind:'rectangle',size:{x:64,y:24}});
      const circle=await call('collision2d.set_shape',{node_path:'/Main/Body/Collider',shape:{kind:'circle',radius:12}});
      expect(circle.isError).not.toBe(true);
      expect((circle.structuredContent as any).shape).toMatchObject({kind:'circle',radius:12});
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect((((await call('collision2d.inspect',{node_path:'/Main/Body/Collider'})).structuredContent as any).shape)).toMatchObject({kind:'rectangle',size:{x:64,y:24}});
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});
      expect((((await call('collision2d.inspect',{node_path:'/Main/Body/Collider'})).structuredContent as any).shape)).toMatchObject({kind:'circle',radius:12});

      const badCapsule=await call('collision2d.set_shape',{node_path:'/Main/Body/Collider',shape:{kind:'capsule',radius:10,height:15}});
      expect(badCapsule.isError).toBe(true);
      const capsule=await call('collision2d.set_shape',{node_path:'/Main/Body/Collider',shape:{kind:'capsule',radius:10,height:40}});
      expect(capsule.isError,JSON.stringify(capsule.structuredContent)).not.toBe(true);
      expect((capsule.structuredContent as any).shape).toMatchObject({kind:'capsule',radius:10,height:40});
      const cleared=await call('collision2d.set_shape',{node_path:'/Main/Body/Collider',shape:null});
      expect(cleared.isError).not.toBe(true);
      expect((cleared.structuredContent as any).shape).toEqual({kind:'none'});
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect((((await call('collision2d.inspect',{node_path:'/Main/Body/Collider'})).structuredContent as any).shape)).toMatchObject({kind:'capsule',radius:10,height:40});

      const invalidParallax=await call('parallax2d.configure',{node_path:'/Main/Background',limit_begin:{x:100,y:100},limit_end:{x:0,y:0}});
      expect(invalidParallax.isError).toBe(true);
      expect(invalidParallax.structuredContent).toMatchObject({error:{code:'PARALLAX_LIMITS_INVALID'}});
      const parallax=await call('parallax2d.configure',{
        node_path:'/Main/Background',repeat_size:{x:640,y:360},repeat_times:3,scroll_scale:{x:0.5,y:0.5},
        autoscroll:{x:12,y:0},scroll_offset:{x:4,y:6},follow_viewport:false,limit_begin:{x:-100,y:-100},limit_end:{x:1000,y:800}
      });
      expect(parallax.isError,JSON.stringify(parallax.structuredContent)).not.toBe(true);
      expect(parallax.structuredContent).toMatchObject({
        repeat_size:{x:640,y:360},repeat_times:3,scroll_scale:{x:0.5,y:0.5},autoscroll:{x:12,y:0},scroll_offset:{x:4,y:6},
        follow_viewport:false,limit_begin:{x:-100,y:-100},limit_end:{x:1000,y:800}
      });

      const wrongSprite=await call('sprite2d.inspect',{node_path:'/Main/Actor'});
      expect(wrongSprite.isError).toBe(true);
      expect(wrongSprite.structuredContent).toMatchObject({error:{code:'INVALID_NODE_TYPE'}});
      const wrongCollision=await call('collision2d.inspect',{node_path:'/Main/SceneCamera'});
      expect(wrongCollision.isError).toBe(true);
      expect(wrongCollision.structuredContent).toMatchObject({error:{code:'INVALID_NODE_TYPE'}});

      expect((await call('scene.save')).structuredContent).toMatchObject({saved:true});
      expect((await confirmFixtureOperation(client,'scene.reload',{})).structuredContent).toMatchObject({reloaded:true});

      const persistedTransform=await call('node2d.inspect_transform',{node_path:'/Main/Actor'});
      expect((persistedTransform.structuredContent as any).position).toEqual({x:100,y:50});
      expect((persistedTransform.structuredContent as any).rotation_degrees).toBeCloseTo(30,5);
      const persistedSprite=await call('sprite2d.inspect',{node_path:'/Main/Actor/Sprite'});
      expect(persistedSprite.structuredContent).toMatchObject({texture_path:'res://sprite.png',hframes:2,vframes:2,frame:3,region_enabled:true,flip_h:true});
      const persistedCamera=await call('camera2d.inspect',{node_path:'/Main/SceneCamera'});
      expect(persistedCamera.structuredContent).toMatchObject({zoom:{x:2,y:2},limit_left:0,limit_top:0,limit_right:640,limit_bottom:360,position_smoothing_enabled:true});
      const persistedCollision=await call('collision2d.inspect',{node_path:'/Main/Body/Collider'});
      expect((persistedCollision.structuredContent as any).shape).toMatchObject({kind:'capsule',radius:10,height:40});
      const persistedParallax=await call('parallax2d.inspect',{node_path:'/Main/Background'});
      expect(persistedParallax.structuredContent).toMatchObject({repeat_size:{x:640,y:360},repeat_times:3,scroll_scale:{x:0.5,y:0.5},follow_viewport:false});
    }finally{
      await client.close().catch(()=>undefined);
      await stopProcess(godot);
    }
  },60000);
});
