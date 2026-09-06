import type {
  Camera2dConfigureInput,Camera2dResult,Collision2dResult,Collision2dSetShapeInput,Node2dSetTransformInput,Node2dTransformResult,
  Parallax2dConfigureInput,Parallax2dResult,Sprite2dConfigureInput,Sprite2dResult
} from '@godot-mcp/protocol';
import type {RpcRouter} from '../bridge/rpc-router.js';

type Rpc=Pick<RpcRouter,'call'>;
type NodeTarget={node_path:string};
type SpriteTextureParams={node_path:string;texture_path:string|null};
const call=<T>(rpc:Rpc,name:string,params:object)=>rpc.call(name,params as Record<string,unknown>) as Promise<T>;
export const inspectNode2dTransform=(rpc:Rpc,params:NodeTarget)=>call<Node2dTransformResult>(rpc,'node2d.inspect_transform',params);
export const setNode2dTransform=(rpc:Rpc,params:Node2dSetTransformInput)=>call<Node2dTransformResult>(rpc,'node2d.set_transform',params);
export const inspectSprite2d=(rpc:Rpc,params:NodeTarget)=>call<Sprite2dResult>(rpc,'sprite2d.inspect',params);
export const setSprite2dTexture=(rpc:Rpc,params:SpriteTextureParams)=>call<Sprite2dResult>(rpc,'sprite2d.set_texture',params);
export const configureSprite2d=(rpc:Rpc,params:Sprite2dConfigureInput)=>call<Sprite2dResult>(rpc,'sprite2d.configure',params);
export const inspectCamera2d=(rpc:Rpc,params:NodeTarget)=>call<Camera2dResult>(rpc,'camera2d.inspect',params);
export const configureCamera2d=(rpc:Rpc,params:Camera2dConfigureInput)=>call<Camera2dResult>(rpc,'camera2d.configure',params);
export const inspectCollision2d=(rpc:Rpc,params:NodeTarget)=>call<Collision2dResult>(rpc,'collision2d.inspect',params);
export const setCollision2dShape=(rpc:Rpc,params:Collision2dSetShapeInput)=>call<Collision2dResult>(rpc,'collision2d.set_shape',params);
export const inspectParallax2d=(rpc:Rpc,params:NodeTarget)=>call<Parallax2dResult>(rpc,'parallax2d.inspect',params);
export const configureParallax2d=(rpc:Rpc,params:Parallax2dConfigureInput)=>call<Parallax2dResult>(rpc,'parallax2d.configure',params);
