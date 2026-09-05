import {describe,expect,it,vi} from 'vitest';
import {
  inspectUiLayout,
  setUiLayoutPreset,
  setUiAnchors,
  setUiOffsets,
  setUiSizeFlags,
  setUiFocusNeighbor
} from '../src/tools/ui-tools.js';
import {
  listAnimations,
  inspectAnimation,
  createAnimation,
  removeAnimation,
  configureAnimation,
  addAnimationTrack,
  insertAnimationKey,
  removeAnimationKey
} from '../src/tools/animation-tools.js';
import {registerUiTools} from '../src/mcp/register-ui-tools.js';
import {registerAnimationTools} from '../src/mcp/register-animation-tools.js';

function rpc(){return {call:vi.fn(async()=>({ok:true}))};}

describe('UI power tools',()=>{
  it('forwards every UI operation to the matching bridge method',async()=>{
    const bridge=rpc();
    await inspectUiLayout(bridge,{node_path:'/Main/HUD'});
    await setUiLayoutPreset(bridge,{node_path:'/Main/HUD',preset:'full_rect'});
    await setUiAnchors(bridge,{node_path:'/Main/HUD',left:0,top:0,right:1,bottom:1});
    await setUiOffsets(bridge,{node_path:'/Main/HUD',left:8});
    await setUiSizeFlags(bridge,{node_path:'/Main/HUD',horizontal:['fill','expand']});
    await setUiFocusNeighbor(bridge,{node_path:'/Main/A',side:'right',neighbor_path:'/Main/B'});
    expect(bridge.call.mock.calls.map(([name])=>name)).toEqual([
      'ui.inspect_layout','ui.set_layout_preset','ui.set_anchors','ui.set_offsets','ui.set_size_flags','ui.set_focus_neighbor'
    ]);
  });

  it('registers exactly the six UI helper names',()=>{
    const names:string[]=[];
    const registrar={registerTool:(name:string)=>{names.push(name);}} as any;
    registerUiTools(registrar,rpc() as any);
    expect(names).toEqual([
      'ui.inspect_layout','ui.set_layout_preset','ui.set_anchors','ui.set_offsets','ui.set_size_flags','ui.set_focus_neighbor'
    ]);
  });
});

describe('animation power tools',()=>{
  it('forwards every animation operation and preserves key values',async()=>{
    const bridge=rpc();
    const target={player_path:'/Main/AnimationPlayer',animation:'fade_in'};
    await listAnimations(bridge,{player_path:target.player_path});
    await inspectAnimation(bridge,target);
    await createAnimation(bridge,{...target,length:0.5});
    await removeAnimation(bridge,target);
    await configureAnimation(bridge,{...target,loop_mode:'linear'});
    await addAnimationTrack(bridge,{...target,type:'value',path:'../HUD:modulate:a'});
    const value={type:'float',value:0.5} as const;
    await insertAnimationKey(bridge,{...target,track_index:0,time:0.5,value});
    await removeAnimationKey(bridge,{...target,track_index:0,key_index:0});
    expect(bridge.call.mock.calls.map(([name])=>name)).toEqual([
      'animation.list','animation.inspect','animation.create','animation.remove','animation.configure','animation.add_track','animation.insert_key','animation.remove_key'
    ]);
    expect(bridge.call).toHaveBeenCalledWith('animation.insert_key',expect.objectContaining({value}));
  });

  it('registers exactly the eight animation helper names',()=>{
    const names:string[]=[];
    const registrar={registerTool:(name:string)=>{names.push(name);}} as any;
    registerAnimationTools(registrar,rpc() as any);
    expect(names).toEqual([
      'animation.list','animation.inspect','animation.create','animation.remove','animation.configure','animation.add_track','animation.insert_key','animation.remove_key'
    ]);
  });
});
