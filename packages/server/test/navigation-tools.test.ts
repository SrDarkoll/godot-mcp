import {describe,expect,it,vi} from 'vitest';
import {
  bakeNavigationMesh,clearNavigationMesh,configureNavigationAgent,configureNavigationMesh,configureNavigationRegion,
  inspectNavigationAgent,inspectNavigationMesh,inspectNavigationRegion,setNavigationMesh,setNavigationOutlines
} from '../src/tools/navigation-tools.js';

describe('navigation RPC forwarders',()=>{
  it('forwards every navigation power tool to its exact bridge method',async()=>{
    const rpc={call:vi.fn().mockResolvedValue({ok:true})};
    await inspectNavigationRegion(rpc as never,{node_path:'/Main/R'});
    await configureNavigationRegion(rpc as never,{node_path:'/Main/R',enabled:true});
    await inspectNavigationMesh(rpc as never,{node_path:'/Main/R'});
    await setNavigationMesh(rpc as never,{node_path:'/Main/R'});
    await configureNavigationMesh(rpc as never,{node_path:'/Main/R',agent_radius:1});
    await setNavigationOutlines(rpc as never,{node_path:'/Main/R',outlines:[[{x:0,y:0},{x:1,y:0},{x:0,y:1}]]});
    await bakeNavigationMesh(rpc as never,{node_path:'/Main/R',source_root_path:'/Main/Source'});
    await clearNavigationMesh(rpc as never,{node_path:'/Main/R'});
    await inspectNavigationAgent(rpc as never,{node_path:'/Main/A'});
    await configureNavigationAgent(rpc as never,{node_path:'/Main/A',max_speed:10});
    expect(rpc.call.mock.calls.map(call=>call[0])).toEqual([
      'navigation.region.inspect','navigation.region.configure','navigation.mesh.inspect','navigation.mesh.set','navigation.mesh.configure',
      'navigation.mesh.set_outlines','navigation.mesh.bake','navigation.mesh.clear','navigation.agent.inspect','navigation.agent.configure'
    ]);
  });
});
