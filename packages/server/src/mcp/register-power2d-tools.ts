import * as z from 'zod/v4';
import {
  Camera2dConfigureSchema,Collision2dSetShapeSchema,Node2dSetTransformSchema,Parallax2dConfigureSchema,Sprite2dConfigureSchema
} from '@godot-mcp/protocol';
import type {BridgeServer} from '../bridge/bridge-server.js';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import {
  configureCamera2d,configureParallax2d,configureSprite2d,inspectCamera2d,inspectCollision2d,
  inspectNode2dTransform,inspectParallax2d,inspectSprite2d,setCollision2dShape,setNode2dTransform,setSprite2dTexture
} from '../tools/power2d-tools.js';
import {omitUndefinedValues} from './omit-undefined.js';
import {toolError,toolSuccess} from './tool-result.js';
const node=z.object({node_path:z.string().min(1).max(1024)});
export function registerPower2dTools(registrar:ToolRegistrar,rpc:BridgeServer['rpc']):void{
  registrar.registerTool('node2d.inspect_transform',{description:'Inspect local and global Node2D transform values.',inputSchema:node},async args=>{try{return toolSuccess(await inspectNode2dTransform(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('node2d.set_transform',{description:'Atomically set local Node2D position, rotation, scale or skew with Undo/Redo.',inputSchema:Node2dSetTransformSchema},async args=>{try{return toolSuccess(await setNode2dTransform(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('sprite2d.inspect',{description:'Inspect Sprite2D texture, frame, region, flip and offset state.',inputSchema:node},async args=>{try{return toolSuccess(await inspectSprite2d(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('sprite2d.set_texture',{description:'Assign or clear a project Texture2D on Sprite2D with Undo/Redo.',inputSchema:z.object({node_path:z.string().min(1).max(1024),texture_path:z.string().max(2048).nullable()})},async args=>{try{return toolSuccess(await setSprite2dTexture(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('sprite2d.configure',{description:'Atomically configure Sprite2D frame grid, region, flip, centering and offset.',inputSchema:Sprite2dConfigureSchema},async args=>{try{return toolSuccess(await configureSprite2d(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('camera2d.inspect',{description:'Inspect persistent Camera2D zoom, limits, smoothing and drag settings.',inputSchema:node},async args=>{try{return toolSuccess(await inspectCamera2d(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('camera2d.configure',{description:'Atomically configure persistent Camera2D zoom, limits, smoothing and drag settings.',inputSchema:Camera2dConfigureSchema},async args=>{try{return toolSuccess(await configureCamera2d(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('collision2d.inspect',{description:'Inspect CollisionShape2D and supported shape dimensions.',inputSchema:node},async args=>{try{return toolSuccess(await inspectCollision2d(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('collision2d.set_shape',{description:'Create, replace or clear RectangleShape2D, CircleShape2D or CapsuleShape2D with Undo/Redo.',inputSchema:Collision2dSetShapeSchema},async args=>{try{return toolSuccess(await setCollision2dShape(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('parallax2d.inspect',{description:'Inspect Parallax2D repeat, scrolling, viewport following and limits.',inputSchema:node},async args=>{try{return toolSuccess(await inspectParallax2d(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('parallax2d.configure',{description:'Atomically configure Parallax2D repeat, scrolling, viewport following and limits.',inputSchema:Parallax2dConfigureSchema},async args=>{try{return toolSuccess(await configureParallax2d(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
}
