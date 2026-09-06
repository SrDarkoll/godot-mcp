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
  registrar.registerTool('navigation.region.inspect',{inputSchema:NavigationNodeTargetSchema},async args=>{try{return toolSuccess(await inspectNavigationRegion(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.region.configure',{inputSchema:NavigationRegionConfigureSchema},async args=>{try{return toolSuccess(await configureNavigationRegion(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.inspect',{inputSchema:NavigationNodeTargetSchema},async args=>{try{return toolSuccess(await inspectNavigationMesh(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.set',{inputSchema:NavigationNodeTargetSchema},async args=>{try{return toolSuccess(await setNavigationMesh(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.configure',{inputSchema:NavigationMeshConfigureSchema},async args=>{try{return toolSuccess(await configureNavigationMesh(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.set_outlines',{inputSchema:NavigationMeshSetOutlinesSchema},async args=>{try{return toolSuccess(await setNavigationOutlines(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.bake',{inputSchema:NavigationMeshBakeSchema},async args=>{try{return toolSuccess(await bakeNavigationMesh(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.mesh.clear',{inputSchema:NavigationNodeTargetSchema},async args=>{try{return toolSuccess(await clearNavigationMesh(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.agent.inspect',{inputSchema:NavigationNodeTargetSchema},async args=>{try{return toolSuccess(await inspectNavigationAgent(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('navigation.agent.configure',{inputSchema:NavigationAgentConfigureSchema},async args=>{try{return toolSuccess(await configureNavigationAgent(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
}
