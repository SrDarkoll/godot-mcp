import {describe,expect,it,vi} from 'vitest';
import {
  configureCamera2d,configureParallax2d,configureSprite2d,inspectCamera2d,inspectCollision2d,
  inspectNode2dTransform,inspectParallax2d,inspectSprite2d,setCollision2dShape,setNode2dTransform,setSprite2dTexture
} from '../src/tools/power2d-tools.js';
import {registerPower2dTools} from '../src/mcp/register-power2d-tools.js';
function rpc(){return {call:vi.fn(async()=>({ok:true}))};}

describe('2D power tools',()=>{
  it('forwards all 11 operations to matching bridge methods',async()=>{
    const bridge=rpc();
    await inspectNode2dTransform(bridge,{node_path:'/Main/Actor'});
    await setNode2dTransform(bridge,{node_path:'/Main/Actor',position:{x:1,y:2}});
    await inspectSprite2d(bridge,{node_path:'/Main/Actor/Sprite'});
    await setSprite2dTexture(bridge,{node_path:'/Main/Actor/Sprite',texture_path:'res://sprite.png'});
    await configureSprite2d(bridge,{node_path:'/Main/Actor/Sprite',flip_h:true});
    await inspectCamera2d(bridge,{node_path:'/Main/Camera'});
    await configureCamera2d(bridge,{node_path:'/Main/Camera',zoom:{x:2,y:2}});
    await inspectCollision2d(bridge,{node_path:'/Main/Body/Collider'});
    await setCollision2dShape(bridge,{node_path:'/Main/Body/Collider',shape:{kind:'circle',radius:8}});
    await inspectParallax2d(bridge,{node_path:'/Main/Background'});
    await configureParallax2d(bridge,{node_path:'/Main/Background',scroll_scale:{x:0.5,y:0.5}});
    expect(bridge.call.mock.calls.map(([name])=>name)).toEqual([
      'node2d.inspect_transform','node2d.set_transform','sprite2d.inspect','sprite2d.set_texture','sprite2d.configure',
      'camera2d.inspect','camera2d.configure','collision2d.inspect','collision2d.set_shape','parallax2d.inspect','parallax2d.configure'
    ]);
  });

  it('registers exactly the 11 2D helper names',()=>{
    const names:string[]=[];
    const registrar={registerTool:(name:string)=>names.push(name)} as any;
    registerPower2dTools(registrar,rpc() as any);
    expect(names).toEqual([
      'node2d.inspect_transform','node2d.set_transform','sprite2d.inspect','sprite2d.set_texture','sprite2d.configure',
      'camera2d.inspect','camera2d.configure','collision2d.inspect','collision2d.set_shape','parallax2d.inspect','parallax2d.configure'
    ]);
  });
});
