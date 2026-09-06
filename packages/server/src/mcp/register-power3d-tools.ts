import * as z from 'zod/v4';
import {Camera3dConfigureSchema,Collision3dSetShapeSchema,Light3dConfigureSchema,Mesh3dSetPrimitiveSchema,Node3dSetTransformSchema} from '@godot-mcp/protocol';
import type {BridgeServer} from '../bridge/bridge-server.js';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import {configureCamera3d,configureLight3d,inspectCamera3d,inspectCollision3d,inspectLight3d,inspectMesh3d,inspectNode3dTransform,setCollision3dShape,setMesh3dPrimitive,setNode3dTransform} from '../tools/power3d-tools.js';
import {omitUndefinedValues} from './omit-undefined.js';
import {toolError,toolSuccess} from './tool-result.js';
const node=z.object({node_path:z.string().min(1).max(1024)});
export function registerPower3dTools(registrar:ToolRegistrar,rpc:BridgeServer['rpc']):void{
  registrar.registerTool('node3d.inspect_transform',{description:'Inspect local and global Node3D transforms.',inputSchema:node},async args=>{try{return toolSuccess(await inspectNode3dTransform(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('node3d.set_transform',{description:'Atomically set local Node3D position, rotation or stable scale with Undo/Redo.',inputSchema:Node3dSetTransformSchema},async args=>{try{return toolSuccess(await setNode3dTransform(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('mesh3d.inspect',{description:'Inspect MeshInstance3D mesh type, primitive dimensions and surfaces.',inputSchema:node},async args=>{try{return toolSuccess(await inspectMesh3d(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('mesh3d.set_primitive',{description:'Assign or clear an embedded primitive Mesh on MeshInstance3D with Undo/Redo.',inputSchema:Mesh3dSetPrimitiveSchema},async args=>{try{return toolSuccess(await setMesh3dPrimitive(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('camera3d.inspect',{description:'Inspect persistent Camera3D projection and clipping settings.',inputSchema:node},async args=>{try{return toolSuccess(await inspectCamera3d(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('camera3d.configure',{description:'Atomically configure Camera3D projection, clipping, offsets and cull mask.',inputSchema:Camera3dConfigureSchema},async args=>{try{return toolSuccess(await configureCamera3d(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('collision3d.inspect',{description:'Inspect CollisionShape3D and supported primitive dimensions.',inputSchema:node},async args=>{try{return toolSuccess(await inspectCollision3d(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('collision3d.set_shape',{description:'Assign or clear an embedded primitive Shape3D with Undo/Redo.',inputSchema:Collision3dSetShapeSchema},async args=>{try{return toolSuccess(await setCollision3dShape(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('light3d.inspect',{description:'Inspect DirectionalLight3D, OmniLight3D or SpotLight3D settings.',inputSchema:node},async args=>{try{return toolSuccess(await inspectLight3d(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('light3d.configure',{description:'Atomically configure common and subtype-specific Light3D settings.',inputSchema:Light3dConfigureSchema},async args=>{try{return toolSuccess(await configureLight3d(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
}
