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
const TEXTURE_PNG_BASE64='iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAANUlEQVR42u3OsQ0AMAwCMP5/Os0PVMpiEDPOJNPsQwEAAAAAAACOAeX/JtUAAAAAAAAAzgEPKMv3eUpmLE8AAAAASUVORK5CYII=';

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

describe('Godot 3D and material power tools',()=>{
  test('authors persistent 3D primitives, camera, collisions, lights, materials and spatial shader state with Undo/Redo',async()=>{
    const godotBin=process.env.GODOT_BIN;
    if(!godotBin) throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');
    const tempRoot=await mkdtemp(path.join(os.tmpdir(),'godot-mcp-3d-materials-'));
    tempRoots.push(tempRoot);
    await cp(fixtureRoot,tempRoot,{recursive:true});
    await writeFile(path.join(tempRoot,'surface.png'),Buffer.from(TEXTURE_PNG_BASE64,'base64'));
    await initProject({projectRoot:tempRoot,godotBin,enable:true});

    const serverEntry=path.resolve('packages/server/dist/index.js');
    const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry,'--project',tempRoot,'--bridge-port','0']});
    const client=new Client({name:'power3d-integration-test',version:'0.1.0'},{capabilities:{elicitation:{form:{}}}});
    await client.connect(transport);
    let godot:ChildProcess|null=null;
    const call=(name:string,args:Record<string,unknown>={})=>client.callTool({name,arguments:args});
    try{
      godot=spawn(godotBin,['--headless','--path',tempRoot,'--editor','res://main.tscn'],{stdio:'inherit',windowsHide:true});
      expect(await waitFor(async()=>((await call('session.status')).structuredContent as any)?.editorConnected===true,15000)).toBe(true);
      expect(await waitFor(async()=>!!((await call('scene.get_tree')).structuredContent as any)?.root,10000)).toBe(true);

      for(const [parent_path,type,name] of [
        ['/Main','Node3D','World'],
        ['/Main/World','MeshInstance3D','Model'],
        ['/Main/World','Camera3D','Camera'],
        ['/Main/World','StaticBody3D','Body'],
        ['/Main/World/Body','CollisionShape3D','Collider'],
        ['/Main/World','OmniLight3D','Lamp'],
        ['/Main/World','SpotLight3D','Spot'],
        ['/Main/World','DirectionalLight3D','Sun']
      ] as const){
        const created=await call('node.create',{parent_path,type,name});
        expect(created.isError,JSON.stringify(created.structuredContent)).not.toBe(true);
      }

      const initialTransform=await call('node3d.inspect_transform',{node_path:'/Main/World'});
      expect(initialTransform.isError).not.toBe(true);
      expect(initialTransform.structuredContent).toMatchObject({position:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}});
      const invalidScale=await call('node3d.set_transform',{node_path:'/Main/World',scale:{x:1,y:0,z:1}});
      expect(invalidScale.isError).toBe(true);
      const transform=await call('node3d.set_transform',{
        node_path:'/Main/World',position:{x:1,y:2,z:3},rotation_degrees:{x:10,y:20,z:30},scale:{x:2,y:2,z:2}
      });
      expect(transform.isError,JSON.stringify(transform.structuredContent)).not.toBe(true);
      expect(transform.structuredContent).toMatchObject({position:{x:1,y:2,z:3},scale:{x:2,y:2,z:2}});
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('node3d.inspect_transform',{node_path:'/Main/World'})).structuredContent as any).position).toEqual({x:0,y:0,z:0});
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});

      const box=await call('mesh3d.set_primitive',{node_path:'/Main/World/Model',primitive:{kind:'box',size:{x:2,y:3,z:4}}});
      expect(box.isError,JSON.stringify(box.structuredContent)).not.toBe(true);
      expect((box.structuredContent as any).primitive).toMatchObject({kind:'box',size:{x:2,y:3,z:4}});
      expect((box.structuredContent as any).surface_count).toBeGreaterThanOrEqual(1);
      const cylinder=await call('mesh3d.set_primitive',{node_path:'/Main/World/Model',primitive:{kind:'cylinder',top_radius:0.5,bottom_radius:1,height:3}});
      expect(cylinder.isError).not.toBe(true);
      expect((cylinder.structuredContent as any).primitive).toMatchObject({kind:'cylinder',top_radius:0.5,bottom_radius:1,height:3});
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('mesh3d.inspect',{node_path:'/Main/World/Model'})).structuredContent as any).primitive).toMatchObject({kind:'box'});

      const initialCamera=await call('camera3d.inspect',{node_path:'/Main/World/Camera'});
      expect(initialCamera.isError).not.toBe(true);
      expect(initialCamera.structuredContent).toMatchObject({projection:'perspective'});
      const badClip=await call('camera3d.configure',{node_path:'/Main/World/Camera',near:10,far:5});
      expect(badClip.isError).toBe(true);
      const camera=await call('camera3d.configure',{
        node_path:'/Main/World/Camera',projection:'frustum',size:8,near:0.2,far:500,keep_aspect:'width',
        frustum_offset:{x:0.5,y:-0.25},h_offset:0.1,v_offset:-0.2,cull_mask:0x3ff
      });
      expect(camera.isError,JSON.stringify(camera.structuredContent)).not.toBe(true);
      expect(camera.structuredContent).toMatchObject({projection:'frustum',size:8,far:500,keep_aspect:'width',frustum_offset:{x:0.5,y:-0.25},cull_mask:0x3ff});
      expect((camera.structuredContent as any).near).toBeCloseTo(0.2,5);
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('camera3d.inspect',{node_path:'/Main/World/Camera'})).structuredContent as any).projection).toBe('perspective');
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});

      const collisionBox=await call('collision3d.set_shape',{node_path:'/Main/World/Body/Collider',shape:{kind:'box',size:{x:2,y:1,z:3}}});
      expect(collisionBox.isError,JSON.stringify(collisionBox.structuredContent)).not.toBe(true);
      expect((collisionBox.structuredContent as any).shape).toMatchObject({kind:'box',size:{x:2,y:1,z:3}});
      const collisionCapsule=await call('collision3d.set_shape',{node_path:'/Main/World/Body/Collider',shape:{kind:'capsule',radius:0.5,height:2}});
      expect(collisionCapsule.isError).not.toBe(true);
      expect((collisionCapsule.structuredContent as any).shape).toMatchObject({kind:'capsule',radius:0.5,height:2});
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('collision3d.inspect',{node_path:'/Main/World/Body/Collider'})).structuredContent as any).shape).toMatchObject({kind:'box'});
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});

      const wrongSubtype=await call('light3d.configure',{node_path:'/Main/World/Lamp',spot_angle:30});
      expect(wrongSubtype.isError).toBe(true);
      const lamp=await call('light3d.configure',{
        node_path:'/Main/World/Lamp',color:{r:1,g:0.8,b:0.6,a:1},energy:3,indirect_energy:1.2,specular:0.7,shadow_enabled:true,range:12,attenuation:1.5
      });
      expect(lamp.isError,JSON.stringify(lamp.structuredContent)).not.toBe(true);
      expect(lamp.structuredContent).toMatchObject({type:'OmniLight3D',energy:3,range:12,attenuation:1.5,shadow_enabled:true});
      const spot=await call('light3d.configure',{node_path:'/Main/World/Spot',energy:2,range:15,attenuation:2,spot_angle:35,spot_angle_attenuation:1.25});
      expect(spot.isError,JSON.stringify(spot.structuredContent)).not.toBe(true);
      expect(spot.structuredContent).toMatchObject({type:'SpotLight3D',range:15,spot_angle:35});
      const sun=await call('light3d.configure',{node_path:'/Main/World/Sun',energy:1.5,shadow_enabled:true,shadow_max_distance:250});
      expect(sun.isError,JSON.stringify(sun.structuredContent)).not.toBe(true);
      expect(sun.structuredContent).toMatchObject({type:'DirectionalLight3D',shadow_max_distance:250,shadow_enabled:true});
      expect((await call('light3d.inspect',{node_path:'/Main/World/Lamp'})).structuredContent).toMatchObject({energy:3,range:12});

      const missingSurface=await call('material3d.inspect',{node_path:'/Main/World/Model',surface_index:99});
      expect(missingSurface.isError).toBe(true);
      expect(missingSurface.structuredContent).toMatchObject({error:{code:'SURFACE_NOT_FOUND'}});
      const mismatchedMaterial=await call('material3d.configure_standard',{node_path:'/Main/World/Model',roughness:0.4});
      expect(mismatchedMaterial.isError).toBe(true);
      expect(mismatchedMaterial.structuredContent).toMatchObject({error:{code:'MATERIAL_TYPE_MISMATCH'}});
      const missingTexture=await call('material3d.set_standard',{node_path:'/Main/World/Model',albedo_texture_path:'res://missing.png'});
      expect(missingTexture.isError).toBe(true);
      expect(missingTexture.structuredContent).toMatchObject({error:{code:'RESOURCE_NOT_FOUND'}});

      const surfaceStandard=await call('material3d.set_standard',{
        node_path:'/Main/World/Model',surface_index:0,albedo_color:{r:0.25,g:0.5,b:0.75,a:1},albedo_texture_path:'res://surface.png',
        metallic:0.2,roughness:0.8,cull_mode:'back',transparency:'disabled'
      });
      expect(surfaceStandard.isError,JSON.stringify(surfaceStandard.structuredContent)).not.toBe(true);
      expect((surfaceStandard.structuredContent as any).material).toMatchObject({kind:'standard',albedo_texture_path:'res://surface.png'});
      expect((surfaceStandard.structuredContent as any).material.metallic).toBeCloseTo(0.2,5);
      expect((surfaceStandard.structuredContent as any).material.roughness).toBeCloseTo(0.8,5);
      const configuredStandard=await call('material3d.configure_standard',{
        node_path:'/Main/World/Model',surface_index:0,roughness:0.35,emission_enabled:true,emission:{r:0.1,g:0.2,b:0.3,a:1},emission_energy_multiplier:2,
        normal_enabled:true,normal_texture_path:'res://surface.png',normal_scale:0.75,cull_mode:'disabled',transparency:'alpha_scissor'
      });
      expect(configuredStandard.isError,JSON.stringify(configuredStandard.structuredContent)).not.toBe(true);
      expect((configuredStandard.structuredContent as any).material).toMatchObject({kind:'standard',emission_enabled:true,normal_enabled:true,cull_mode:'disabled',transparency:'alpha_scissor'});
      expect((configuredStandard.structuredContent as any).material.roughness).toBeCloseTo(0.35,5);
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      const standardAfterUndo=await call('material3d.inspect',{node_path:'/Main/World/Model',surface_index:0});
      expect((standardAfterUndo.structuredContent as any).material.roughness).toBeCloseTo(0.8,5);
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});

      const overrideStandard=await call('material3d.set_standard',{node_path:'/Main/World/Model',albedo_color:{r:1,g:0,b:0,a:1}});
      expect(overrideStandard.isError).not.toBe(true);
      expect((overrideStandard.structuredContent as any).material.kind).toBe('standard');
      const cleared=await call('material3d.clear',{node_path:'/Main/World/Model'});
      expect(cleared.isError).not.toBe(true);
      expect((cleared.structuredContent as any).material.kind).toBe('none');
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('material3d.inspect',{node_path:'/Main/World/Model'})).structuredContent as any).material.kind).toBe('standard');
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});

      const shaderCode='shader_type spatial;\nuniform float strength = 0.25;\nvoid fragment(){ ALBEDO = vec3(strength); }';
      const shader=await call('shader3d.set_code',{node_path:'/Main/World/Model',code:shaderCode});
      expect(shader.isError,JSON.stringify(shader.structuredContent)).not.toBe(true);
      expect((shader.structuredContent as any).material.kind).toBe('shader');
      expect((shader.structuredContent as any).shader.code).toContain('shader_type spatial;');
      expect((shader.structuredContent as any).shader.uniforms.map((entry:any)=>entry.name)).toContain('strength');
      const inspectedShader=await call('shader3d.inspect',{node_path:'/Main/World/Model'});
      expect(inspectedShader.isError).not.toBe(true);
      expect((inspectedShader.structuredContent as any).shader.mode).toBe('spatial');
      const missingUniform=await call('shader3d.set_parameter',{node_path:'/Main/World/Model',name:'Strength',value:{type:'float',value:0.5}});
      expect(missingUniform.isError).toBe(true);
      expect(missingUniform.structuredContent).toMatchObject({error:{code:'UNIFORM_NOT_FOUND'}});
      const parameter=await call('shader3d.set_parameter',{node_path:'/Main/World/Model',name:'strength',value:{type:'float',value:0.8}});
      expect(parameter.isError,JSON.stringify(parameter.structuredContent)).not.toBe(true);
      const uniform=(parameter.structuredContent as any).shader.uniforms.find((entry:any)=>entry.name==='strength');
      expect(uniform.value.type).toBe('float');
      expect(uniform.value.value).toBeCloseTo(0.8,5);

      expect((await call('scene.save')).structuredContent).toMatchObject({saved:true});
      expect((await confirmFixtureOperation(client,'scene.reload',{})).structuredContent).toMatchObject({reloaded:true});

      const persistedTransform=await call('node3d.inspect_transform',{node_path:'/Main/World'});
      expect(persistedTransform.structuredContent).toMatchObject({position:{x:1,y:2,z:3}});
      const persistedScale=(persistedTransform.structuredContent as any).scale;
      expect(persistedScale.x).toBeCloseTo(2,5);
      expect(persistedScale.y).toBeCloseTo(2,5);
      expect(persistedScale.z).toBeCloseTo(2,5);
      const persistedMesh=await call('mesh3d.inspect',{node_path:'/Main/World/Model'});
      expect((persistedMesh.structuredContent as any).primitive).toMatchObject({kind:'box',size:{x:2,y:3,z:4}});
      const persistedCamera=await call('camera3d.inspect',{node_path:'/Main/World/Camera'});
      expect(persistedCamera.structuredContent).toMatchObject({projection:'frustum',size:8,far:500});
      expect((persistedCamera.structuredContent as any).near).toBeCloseTo(0.2,5);
      const persistedCollision=await call('collision3d.inspect',{node_path:'/Main/World/Body/Collider'});
      expect((persistedCollision.structuredContent as any).shape).toMatchObject({kind:'capsule',radius:0.5,height:2});
      const persistedLamp=await call('light3d.inspect',{node_path:'/Main/World/Lamp'});
      expect(persistedLamp.structuredContent).toMatchObject({energy:3,range:12});
      const persistedStandard=await call('material3d.inspect',{node_path:'/Main/World/Model',surface_index:0});
      expect((persistedStandard.structuredContent as any).material).toMatchObject({kind:'standard',albedo_texture_path:'res://surface.png',normal_texture_path:'res://surface.png',normal_enabled:true});
      expect((persistedStandard.structuredContent as any).material.roughness).toBeCloseTo(0.35,5);
      const persistedShader=await call('shader3d.inspect',{node_path:'/Main/World/Model'});
      expect((persistedShader.structuredContent as any).shader.code).toContain('uniform float strength');
      const persistedUniform=(persistedShader.structuredContent as any).shader.uniforms.find((entry:any)=>entry.name==='strength');
      expect(persistedUniform.value.value).toBeCloseTo(0.8,5);

      const invalidNode=await call('mesh3d.inspect',{node_path:'/Main/Player'});
      expect(invalidNode.isError).toBe(true);
      expect(invalidNode.structuredContent).toMatchObject({error:{code:'INVALID_NODE_TYPE'}});
    }finally{
      await client.close().catch(()=>undefined);
      await stopProcess(godot);
    }
  },70000);
});
