import type {
  NavigationAgentConfigureInput,NavigationAgentResult,NavigationMeshBakeInput,NavigationMeshConfigureInput,NavigationMeshResult,
  NavigationMeshSetInput,NavigationMeshSetOutlinesInput,NavigationNodeTarget,NavigationRegionConfigureInput,NavigationRegionResult
} from '@godot-mcp/protocol';
import type {RpcRouter} from '../bridge/rpc-router.js';

type Rpc=Pick<RpcRouter,'call'>;
const call=<T>(rpc:Rpc,name:string,params:object)=>rpc.call(name,params as Record<string,unknown>) as Promise<T>;
export const inspectNavigationRegion=(rpc:Rpc,args:NavigationNodeTarget)=>call<NavigationRegionResult>(rpc,'navigation.region.inspect',args);
export const configureNavigationRegion=(rpc:Rpc,args:NavigationRegionConfigureInput)=>call<NavigationRegionResult>(rpc,'navigation.region.configure',args);
export const inspectNavigationMesh=(rpc:Rpc,args:NavigationNodeTarget)=>call<NavigationMeshResult>(rpc,'navigation.mesh.inspect',args);
export const setNavigationMesh=(rpc:Rpc,args:NavigationMeshSetInput)=>call<NavigationMeshResult>(rpc,'navigation.mesh.set',args);
export const configureNavigationMesh=(rpc:Rpc,args:NavigationMeshConfigureInput)=>call<NavigationMeshResult>(rpc,'navigation.mesh.configure',args);
export const setNavigationOutlines=(rpc:Rpc,args:NavigationMeshSetOutlinesInput)=>call<NavigationMeshResult>(rpc,'navigation.mesh.set_outlines',args);
export const bakeNavigationMesh=(rpc:Rpc,args:NavigationMeshBakeInput)=>call<NavigationMeshResult>(rpc,'navigation.mesh.bake',args);
export const clearNavigationMesh=(rpc:Rpc,args:NavigationNodeTarget)=>call<NavigationMeshResult>(rpc,'navigation.mesh.clear',args);
export const inspectNavigationAgent=(rpc:Rpc,args:NavigationNodeTarget)=>call<NavigationAgentResult>(rpc,'navigation.agent.inspect',args);
export const configureNavigationAgent=(rpc:Rpc,args:NavigationAgentConfigureInput)=>call<NavigationAgentResult>(rpc,'navigation.agent.configure',args);
