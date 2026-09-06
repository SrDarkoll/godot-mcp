import fs from 'node:fs';
import path from 'node:path';
import {describe,expect,it,vi} from 'vitest';
import {
  configureCamera3d,configureLight3d,inspectMesh3d,setCollision3dShape,setMesh3dPrimitive,setNode3dTransform
} from '../src/tools/power3d-tools.js';
import {
  clearMaterial3d,configureStandardMaterial3d,inspectShader3d,setShader3dCode,setShader3dParameter,setStandardMaterial3d
} from '../src/tools/material3d-tools.js';

describe('3D/material RPC forwarders',()=>{
  it('forwards 3D scene tools to their exact bridge methods',async()=>{
    const rpc={call:vi.fn().mockResolvedValue({ok:true})};
    await setNode3dTransform(rpc as never,{node_path:'/Main',position:{x:1,y:2,z:3}});
    await inspectMesh3d(rpc as never,{node_path:'/Main/Model'});
    await setMesh3dPrimitive(rpc as never,{node_path:'/Main/Model',primitive:null});
    await configureCamera3d(rpc as never,{node_path:'/Main/Camera',near:.1,far:100});
    await setCollision3dShape(rpc as never,{node_path:'/Main/Collision',shape:null});
    await configureLight3d(rpc as never,{node_path:'/Main/Sun',energy:2});
    expect(rpc.call.mock.calls.map(call=>call[0])).toEqual([
      'node3d.set_transform','mesh3d.inspect','mesh3d.set_primitive','camera3d.configure','collision3d.set_shape','light3d.configure'
    ]);
  });

  it('forwards material and shader tools to their exact bridge methods',async()=>{
    const rpc={call:vi.fn().mockResolvedValue({ok:true})};
    await setStandardMaterial3d(rpc as never,{node_path:'/Main/Model'});
    await configureStandardMaterial3d(rpc as never,{node_path:'/Main/Model',roughness:.4});
    await clearMaterial3d(rpc as never,{node_path:'/Main/Model'});
    await setShader3dCode(rpc as never,{node_path:'/Main/Model',code:'shader_type spatial;'});
    await inspectShader3d(rpc as never,{node_path:'/Main/Model'});
    await setShader3dParameter(rpc as never,{node_path:'/Main/Model',name:'amount',value:{type:'float',value:.5}});
    expect(rpc.call.mock.calls.map(call=>call[0])).toEqual([
      'material3d.set_standard','material3d.configure_standard','material3d.clear','shader3d.set_code','shader3d.inspect','shader3d.set_parameter'
    ]);
  });

  it('keeps Phase 3 RPC forwarder results typed before MCP wrapping',()=>{
    const powerSource=fs.readFileSync(path.resolve(import.meta.dirname,'../src/tools/power3d-tools.ts'),'utf8');
    const materialSource=fs.readFileSync(path.resolve(import.meta.dirname,'../src/tools/material3d-tools.ts'),'utf8');
    for(const resultType of ['Node3dTransformResult','Mesh3dResult','Camera3dResult','Collision3dResult','Light3dResult'])
      expect(powerSource).toContain(`call<${resultType}>`);
    expect(materialSource).toContain('call<Material3dResult>');
    expect(materialSource).toContain('call<Shader3dResult>');
  });

});
