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
import {bindCanonicalTool,defineCanonicalToolBinding} from '../tooling/canonical-tool-binding.js';
import {omitUndefinedValues} from './omit-undefined.js';

const navigationRegionInspectTool=defineCanonicalToolBinding('navigation.region.inspect',{inputSchema:NavigationNodeTargetSchema,handler:inspectNavigationRegion});
const navigationRegionConfigureTool=defineCanonicalToolBinding('navigation.region.configure',{inputSchema:NavigationRegionConfigureSchema,handler:configureNavigationRegion});
const navigationMeshInspectTool=defineCanonicalToolBinding('navigation.mesh.inspect',{inputSchema:NavigationNodeTargetSchema,handler:inspectNavigationMesh});
const navigationMeshSetTool=defineCanonicalToolBinding('navigation.mesh.set',{inputSchema:NavigationNodeTargetSchema,handler:setNavigationMesh});
const navigationMeshConfigureTool=defineCanonicalToolBinding('navigation.mesh.configure',{inputSchema:NavigationMeshConfigureSchema,handler:configureNavigationMesh});
const navigationMeshSetOutlinesTool=defineCanonicalToolBinding('navigation.mesh.set_outlines',{inputSchema:NavigationMeshSetOutlinesSchema,handler:setNavigationOutlines});
const navigationMeshBakeTool=defineCanonicalToolBinding('navigation.mesh.bake',{inputSchema:NavigationMeshBakeSchema,handler:bakeNavigationMesh});
const navigationMeshClearTool=defineCanonicalToolBinding('navigation.mesh.clear',{inputSchema:NavigationNodeTargetSchema,handler:clearNavigationMesh});
const navigationAgentInspectTool=defineCanonicalToolBinding('navigation.agent.inspect',{inputSchema:NavigationNodeTargetSchema,handler:inspectNavigationAgent});
const navigationAgentConfigureTool=defineCanonicalToolBinding('navigation.agent.configure',{inputSchema:NavigationAgentConfigureSchema,handler:configureNavigationAgent});

export function registerNavigationTools(registrar:ToolRegistrar,rpc:BridgeServer['rpc']):void{
  bindCanonicalTool(registrar,navigationRegionInspectTool,rpc);
  bindCanonicalTool(registrar,navigationRegionConfigureTool,rpc,{mapArgs:omitUndefinedValues});
  bindCanonicalTool(registrar,navigationMeshInspectTool,rpc);
  bindCanonicalTool(registrar,navigationMeshSetTool,rpc);
  bindCanonicalTool(registrar,navigationMeshConfigureTool,rpc,{mapArgs:omitUndefinedValues});
  bindCanonicalTool(registrar,navigationMeshSetOutlinesTool,rpc);
  bindCanonicalTool(registrar,navigationMeshBakeTool,rpc);
  bindCanonicalTool(registrar,navigationMeshClearTool,rpc);
  bindCanonicalTool(registrar,navigationAgentInspectTool,rpc);
  bindCanonicalTool(registrar,navigationAgentConfigureTool,rpc,{mapArgs:omitUndefinedValues});
}
