import {spawn,type ChildProcess} from 'node:child_process';
import {cp,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {afterEach,describe,expect,test} from 'vitest';
import {initProject} from '../../packages/cli/src/init/init-project.js';
import {confirmFixtureOperation} from './helpers/confirm-fixture-operation.js';

const fixtureRoot=path.resolve('fixtures/empty-project');
const tempRoots:string[]=[];

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

describe('Godot navigation power tools',()=>{
  test('authors, bakes and persists unified 2D/3D navigation regions, meshes and agents with Undo/Redo',async()=>{
    const godotBin=process.env.GODOT_BIN;
    if(!godotBin) throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');
    const tempRoot=await mkdtemp(path.join(os.tmpdir(),'godot-mcp-navigation-'));
    tempRoots.push(tempRoot);
    await cp(fixtureRoot,tempRoot,{recursive:true});
    await initProject({projectRoot:tempRoot,godotBin,enable:true});

    const serverEntry=path.resolve('packages/server/dist/index.js');
    const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry,'--project',tempRoot,'--bridge-port','0']});
    const client=new Client({name:'navigation-integration-test',version:'0.1.0'},{capabilities:{elicitation:{form:{}}}});
    await client.connect(transport);
    let godot:ChildProcess|null=null;
    const call=(name:string,args:Record<string,unknown>={})=>client.callTool({name,arguments:args});
    try{
      godot=spawn(godotBin,['--headless','--path',tempRoot,'--editor','res://main.tscn'],{stdio:'inherit',windowsHide:true});
      expect(await waitFor(async()=>((await call('session.status')).structuredContent as any)?.editorConnected===true,15000)).toBe(true);
      expect(await waitFor(async()=>!!((await call('scene.get_tree')).structuredContent as any)?.root,10000)).toBe(true);

      for(const [parent_path,type,name] of [
        ['/Main','Node2D','Nav2D'],
        ['/Main/Nav2D','NavigationRegion2D','Region'],
        ['/Main/Nav2D','Node2D','Source'],
        ['/Main/Nav2D','NavigationAgent2D','Agent'],
        ['/Main','Node3D','Nav3D'],
        ['/Main/Nav3D','NavigationRegion3D','Region'],
        ['/Main/Nav3D','Node3D','Source'],
        ['/Main/Nav3D/Source','MeshInstance3D','Floor'],
        ['/Main/Nav3D','NavigationAgent3D','Agent']
      ] as const){
        const created=await call('node.create',{parent_path,type,name});
        expect(created.isError,JSON.stringify(created.structuredContent)).not.toBe(true);
      }

      const wrongType=await call('navigation.region.inspect',{node_path:'/Main/Nav2D'});
      expect(wrongType.isError).toBe(true);
      expect(wrongType.structuredContent).toMatchObject({error:{code:'NAVIGATION_TYPE_MISMATCH'}});

      const missingResource=await call('navigation.mesh.configure',{node_path:'/Main/Nav2D/Region',agent_radius:4});
      expect(missingResource.isError).toBe(true);
      expect(missingResource.structuredContent).toMatchObject({error:{code:'NAVIGATION_RESOURCE_MISSING'}});

      const region2d=await call('navigation.region.configure',{
        node_path:'/Main/Nav2D/Region',enabled:true,navigation_layers:5,enter_cost:2,travel_cost:1.5,use_edge_connections:false
      });
      expect(region2d.isError,JSON.stringify(region2d.structuredContent)).not.toBe(true);
      expect(region2d.structuredContent).toMatchObject({dimension:'2d',navigation_layers:5,enter_cost:2,travel_cost:1.5,use_edge_connections:false});
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('navigation.region.inspect',{node_path:'/Main/Nav2D/Region'})).structuredContent as any).navigation_layers).toBe(1);
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});

      const set2d=await call('navigation.mesh.set',{node_path:'/Main/Nav2D/Region'});
      expect(set2d.isError,JSON.stringify(set2d.structuredContent)).not.toBe(true);
      expect(set2d.structuredContent).toMatchObject({dimension:'2d',resource:{type:'NavigationPolygon'},polygon_count:0,outline_count:0});

      const wrong2dField=await call('navigation.mesh.configure',{node_path:'/Main/Nav2D/Region',agent_height:2});
      expect(wrong2dField.isError).toBe(true);
      expect(wrong2dField.structuredContent).toMatchObject({error:{code:'NAVIGATION_DIMENSION_MISMATCH'}});

      const configured2d=await call('navigation.mesh.configure',{
        node_path:'/Main/Nav2D/Region',agent_radius:4,cell_size:1,border_size:0,parsed_collision_mask:1,
        parsed_geometry_type:'both',source_geometry_mode:'root_children',sample_partition_type:'convex'
      });
      expect(configured2d.isError,JSON.stringify(configured2d.structuredContent)).not.toBe(true);
      expect(configured2d.structuredContent).toMatchObject({agent_radius:4,cell_size:1,parsed_collision_mask:1,sample_partition_type:'convex'});

      const outlines=await call('navigation.mesh.set_outlines',{
        node_path:'/Main/Nav2D/Region',outlines:[[
          {x:0,y:0},{x:0,y:200},{x:200,y:200},{x:200,y:0}
        ]]
      });
      expect(outlines.isError,JSON.stringify(outlines.structuredContent)).not.toBe(true);
      expect(outlines.structuredContent).toMatchObject({outline_count:1,polygon_count:0});

      const missingSource=await call('navigation.mesh.bake',{node_path:'/Main/Nav2D/Region',source_root_path:'/Main/Nav2D/Missing'});
      expect(missingSource.isError).toBe(true);
      expect(missingSource.structuredContent).toMatchObject({error:{code:'NAVIGATION_SOURCE_ROOT_NOT_FOUND'}});

      const baked2d=await call('navigation.mesh.bake',{node_path:'/Main/Nav2D/Region',source_root_path:'/Main/Nav2D/Source'});
      expect(baked2d.isError,JSON.stringify(baked2d.structuredContent)).not.toBe(true);
      expect((baked2d.structuredContent as any).polygon_count).toBeGreaterThan(0);
      expect((baked2d.structuredContent as any).vertex_count).toBeGreaterThan(0);
      expect((baked2d.structuredContent as any).outline_count).toBe(1);

      const cleared2d=await call('navigation.mesh.clear',{node_path:'/Main/Nav2D/Region'});
      expect(cleared2d.isError,JSON.stringify(cleared2d.structuredContent)).not.toBe(true);
      expect(cleared2d.structuredContent).toMatchObject({polygon_count:0,outline_count:1,agent_radius:4});
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('navigation.mesh.inspect',{node_path:'/Main/Nav2D/Region'})).structuredContent as any).polygon_count).toBeGreaterThan(0);

      const wrongAgent2d=await call('navigation.agent.configure',{node_path:'/Main/Nav2D/Agent',height:2});
      expect(wrongAgent2d.isError).toBe(true);
      expect(wrongAgent2d.structuredContent).toMatchObject({error:{code:'NAVIGATION_DIMENSION_MISMATCH'}});
      const agent2d=await call('navigation.agent.configure',{
        node_path:'/Main/Nav2D/Agent',navigation_layers:3,path_desired_distance:8,target_desired_distance:4,path_max_distance:50,
        radius:6,neighbor_distance:80,max_neighbors:12,max_speed:150,avoidance_enabled:true,avoidance_layers:2,avoidance_mask:3,
        avoidance_priority:0.75,time_horizon_agents:1.5,time_horizon_obstacles:0.5,simplify_path:true,simplify_epsilon:0.25
      });
      expect(agent2d.isError,JSON.stringify(agent2d.structuredContent)).not.toBe(true);
      expect(agent2d.structuredContent).toMatchObject({dimension:'2d',navigation_layers:3,max_neighbors:12,max_speed:150,avoidance_enabled:true,simplify_path:true});
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('navigation.agent.inspect',{node_path:'/Main/Nav2D/Agent'})).structuredContent as any).navigation_layers).toBe(1);
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});

      const floor=await call('mesh3d.set_primitive',{node_path:'/Main/Nav3D/Source/Floor',primitive:{kind:'plane',size:{x:20,y:20},orientation:'y'}});
      expect(floor.isError,JSON.stringify(floor.structuredContent)).not.toBe(true);
      const region3d=await call('navigation.region.configure',{node_path:'/Main/Nav3D/Region',navigation_layers:7,travel_cost:2});
      expect(region3d.isError,JSON.stringify(region3d.structuredContent)).not.toBe(true);
      expect(region3d.structuredContent).toMatchObject({dimension:'3d',navigation_layers:7,travel_cost:2});
      const set3d=await call('navigation.mesh.set',{node_path:'/Main/Nav3D/Region'});
      expect(set3d.isError,JSON.stringify(set3d.structuredContent)).not.toBe(true);
      expect(set3d.structuredContent).toMatchObject({dimension:'3d',resource:{type:'NavigationMesh'}});

      const outlines3d=await call('navigation.mesh.set_outlines',{node_path:'/Main/Nav3D/Region',outlines:[[{x:0,y:0},{x:1,y:0},{x:0,y:1}]]});
      expect(outlines3d.isError).toBe(true);
      expect(outlines3d.structuredContent).toMatchObject({error:{code:'NAVIGATION_OUTLINES_UNSUPPORTED'}});

      const configured3d=await call('navigation.mesh.configure',{
        node_path:'/Main/Nav3D/Region',agent_height:1.5,agent_radius:0.25,agent_max_climb:0.3,agent_max_slope:45,
        cell_size:0.25,cell_height:0.25,border_size:0,collision_mask:1,parsed_geometry_type:'mesh_instances',
        source_geometry_mode:'root_children',sample_partition_type:'watershed',region_min_size:0,region_merge_size:0,vertices_per_polygon:6
      });
      expect(configured3d.isError,JSON.stringify(configured3d.structuredContent)).not.toBe(true);
      expect(configured3d.structuredContent).toMatchObject({agent_height:1.5,agent_radius:0.25,collision_mask:1,sample_partition_type:'watershed',vertices_per_polygon:6});

      const baked3d=await call('navigation.mesh.bake',{node_path:'/Main/Nav3D/Region',source_root_path:'/Main/Nav3D/Source'});
      expect(baked3d.isError,JSON.stringify(baked3d.structuredContent)).not.toBe(true);
      expect((baked3d.structuredContent as any).polygon_count).toBeGreaterThan(0);
      expect((baked3d.structuredContent as any).vertex_count).toBeGreaterThan(0);

      const agent3d=await call('navigation.agent.configure',{
        node_path:'/Main/Nav3D/Agent',navigation_layers:7,path_desired_distance:1,target_desired_distance:0.5,path_max_distance:5,
        radius:0.5,neighbor_distance:8,max_neighbors:10,max_speed:12,avoidance_enabled:true,avoidance_priority:0.6,
        time_horizon_agents:1,time_horizon_obstacles:0.5,simplify_path:true,simplify_epsilon:0.1,height:1.8,
        use_3d_avoidance:true,keep_y_velocity:false,path_height_offset:0.2
      });
      expect(agent3d.isError,JSON.stringify(agent3d.structuredContent)).not.toBe(true);
      expect(agent3d.structuredContent).toMatchObject({dimension:'3d',navigation_layers:7,height:1.8,use_3d_avoidance:true,keep_y_velocity:false});
      expect((agent3d.structuredContent as any).path_height_offset).toBeCloseTo(0.2,5);

      expect((await call('scene.save')).structuredContent).toMatchObject({saved:true});
      expect((await confirmFixtureOperation(client,'scene.reload',{})).structuredContent).toMatchObject({reloaded:true});

      const persisted2dRegion=await call('navigation.region.inspect',{node_path:'/Main/Nav2D/Region'});
      expect(persisted2dRegion.structuredContent).toMatchObject({navigation_layers:5,enter_cost:2,travel_cost:1.5,use_edge_connections:false});
      const persisted2dMesh=await call('navigation.mesh.inspect',{node_path:'/Main/Nav2D/Region'});
      expect((persisted2dMesh.structuredContent as any).polygon_count).toBeGreaterThan(0);
      expect(persisted2dMesh.structuredContent).toMatchObject({outline_count:1,agent_radius:4,sample_partition_type:'convex'});
      const persisted2dAgent=await call('navigation.agent.inspect',{node_path:'/Main/Nav2D/Agent'});
      expect(persisted2dAgent.structuredContent).toMatchObject({navigation_layers:3,max_speed:150,avoidance_enabled:true,simplify_path:true});

      const persisted3dRegion=await call('navigation.region.inspect',{node_path:'/Main/Nav3D/Region'});
      expect(persisted3dRegion.structuredContent).toMatchObject({navigation_layers:7,travel_cost:2});
      const persisted3dMesh=await call('navigation.mesh.inspect',{node_path:'/Main/Nav3D/Region'});
      expect((persisted3dMesh.structuredContent as any).polygon_count).toBeGreaterThan(0);
      expect(persisted3dMesh.structuredContent).toMatchObject({agent_height:1.5,agent_radius:0.25,sample_partition_type:'watershed',vertices_per_polygon:6});
      const persisted3dAgent=await call('navigation.agent.inspect',{node_path:'/Main/Nav3D/Agent'});
      expect(persisted3dAgent.structuredContent).toMatchObject({navigation_layers:7,height:1.8,use_3d_avoidance:true,keep_y_velocity:false});
    }finally{
      await client.close().catch(()=>undefined);
      await stopProcess(godot);
    }
  },90000);
});
