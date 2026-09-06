import {
  NavigationAgentConfigureSchema,NavigationMeshBakeSchema,NavigationMeshConfigureSchema,NavigationMeshSetOutlinesSchema,
  NavigationNodeTargetSchema,NavigationRegionConfigureSchema
} from '@godot-mcp/protocol';
import type {BridgeServer} from '../bridge/bridge-server.js';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import {
  bakeNavigationMesh,clearNavigationMesh,configureNavigationAgent,configureNavigationMesh,configureNavigationRegion,
  inspectNavigationAgent,inspectNavigationMesh,inspectNavigationRegion,setNavigationMesh,setNavigationOutlines
} from '../tools/navigation-tools.js';
import {omitUndefinedValues} from './omit-undefined.js';
import {toolError,toolSuccess} from './tool-result.js';

export function registerNavigationTools(registrar:ToolRegistrar,rpc:BridgeServer['rpc']):void{
  registrar.registerTool('navigation.region.inspect',{description:'Inspect a NavigationRegion2D or NavigationRegion3D and its navigation resource.',inputSchema:NavigationNodeTargetSchema},async args=>{try{return toolSuccess(await inspectNavigationRegion(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.region.configure',{description:'Atomically configure common NavigationRegion2D/3D properties with Undo/Redo.',inputSchema:NavigationRegionConfigureSchema},async args=>{try{return toolSuccess(await configureNavigationRegion(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.inspect',{description:'Inspect the NavigationPolygon or NavigationMesh assigned to a navigation region.',inputSchema:NavigationNodeTargetSchema},async args=>{try{return toolSuccess(await inspectNavigationMesh(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.set',{description:'Create and assign a fresh embedded NavigationPolygon or NavigationMesh matching the region dimension.',inputSchema:NavigationNodeTargetSchema},async args=>{try{return toolSuccess(await setNavigationMesh(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.configure',{description:'Copy-on-write configure NavigationPolygon/NavigationMesh bake settings.',inputSchema:NavigationMeshConfigureSchema},async args=>{try{return toolSuccess(await configureNavigationMesh(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.set_outlines',{description:'Atomically replace bounded NavigationPolygon outlines for a 2D navigation region.',inputSchema:NavigationMeshSetOutlinesSchema},async args=>{try{return toolSuccess(await setNavigationOutlines(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.bake',{description:'Copy-on-write parse and synchronously bake navigation geometry from an explicit scene source root.',inputSchema:NavigationMeshBakeSchema},async args=>{try{return toolSuccess(await bakeNavigationMesh(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.clear',{description:'Copy-on-write clear baked navigation geometry while preserving resource configuration and 2D outlines.',inputSchema:NavigationNodeTargetSchema},async args=>{try{return toolSuccess(await clearNavigationMesh(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.agent.inspect',{description:'Inspect persistent NavigationAgent2D/3D pathfinding and avoidance settings without advancing a path.',inputSchema:NavigationNodeTargetSchema},async args=>{try{return toolSuccess(await inspectNavigationAgent(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.agent.configure',{description:'Atomically configure persistent NavigationAgent2D/3D pathfinding and avoidance settings.',inputSchema:NavigationAgentConfigureSchema},async args=>{try{return toolSuccess(await configureNavigationAgent(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
}
