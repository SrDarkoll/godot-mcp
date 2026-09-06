import * as z from 'zod/v4';
import {Camera3dConfigureSchema,Collision3dSetShapeSchema,Light3dConfigureSchema,Mesh3dSetPrimitiveSchema,Node3dSetTransformSchema} from '@godot-mcp/protocol';
import type {BridgeServer} from '../bridge/bridge-server.js';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import {configureCamera3d,configureLight3d,inspectCamera3d,inspectCollision3d,inspectLight3d,inspectMesh3d,inspectNode3dTransform,setCollision3dShape,setMesh3dPrimitive,setNode3dTransform} from '../tools/power3d-tools.js';
import {bindCanonicalTool,defineCanonicalToolBinding} from '../tooling/canonical-tool-binding.js';
import {omitUndefinedValues} from './omit-undefined.js';

const node=z.object({node_path:z.string().min(1).max(1024)});
const node3dInspectTransformTool=defineCanonicalToolBinding('node3d.inspect_transform',{inputSchema:node,handler:inspectNode3dTransform});
const node3dSetTransformTool=defineCanonicalToolBinding('node3d.set_transform',{inputSchema:Node3dSetTransformSchema,handler:setNode3dTransform});
const mesh3dInspectTool=defineCanonicalToolBinding('mesh3d.inspect',{inputSchema:node,handler:inspectMesh3d});
const mesh3dSetPrimitiveTool=defineCanonicalToolBinding('mesh3d.set_primitive',{inputSchema:Mesh3dSetPrimitiveSchema,handler:setMesh3dPrimitive});
const camera3dInspectTool=defineCanonicalToolBinding('camera3d.inspect',{inputSchema:node,handler:inspectCamera3d});
const camera3dConfigureTool=defineCanonicalToolBinding('camera3d.configure',{inputSchema:Camera3dConfigureSchema,handler:configureCamera3d});
const collision3dInspectTool=defineCanonicalToolBinding('collision3d.inspect',{inputSchema:node,handler:inspectCollision3d});
const collision3dSetShapeTool=defineCanonicalToolBinding('collision3d.set_shape',{inputSchema:Collision3dSetShapeSchema,handler:setCollision3dShape});
const light3dInspectTool=defineCanonicalToolBinding('light3d.inspect',{inputSchema:node,handler:inspectLight3d});
const light3dConfigureTool=defineCanonicalToolBinding('light3d.configure',{inputSchema:Light3dConfigureSchema,handler:configureLight3d});

export function registerPower3dTools(registrar:ToolRegistrar,rpc:BridgeServer['rpc']):void{
  bindCanonicalTool(registrar,node3dInspectTransformTool,rpc);
  bindCanonicalTool(registrar,node3dSetTransformTool,rpc,{mapArgs:omitUndefinedValues});
  bindCanonicalTool(registrar,mesh3dInspectTool,rpc);
  bindCanonicalTool(registrar,mesh3dSetPrimitiveTool,rpc);
  bindCanonicalTool(registrar,camera3dInspectTool,rpc);
  bindCanonicalTool(registrar,camera3dConfigureTool,rpc,{mapArgs:omitUndefinedValues});
  bindCanonicalTool(registrar,collision3dInspectTool,rpc);
  bindCanonicalTool(registrar,collision3dSetShapeTool,rpc);
  bindCanonicalTool(registrar,light3dInspectTool,rpc);
  bindCanonicalTool(registrar,light3dConfigureTool,rpc,{mapArgs:omitUndefinedValues});
}
