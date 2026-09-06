import type {
  Camera3dConfigureInput,Camera3dResult,Collision3dResult,Collision3dSetShapeInput,Light3dConfigureInput,Light3dResult,
  Mesh3dResult,Mesh3dSetPrimitiveInput,Node3dSetTransformInput,Node3dTransformResult
} from '@godot-mcp/protocol';
import type {RpcRouter} from '../bridge/rpc-router.js';

type Rpc=Pick<RpcRouter,'call'>;
type NodeTarget={node_path:string};
const call=<T>(rpc:Rpc,name:string,params:object)=>rpc.call(name,params as Record<string,unknown>) as Promise<T>;
export const inspectNode3dTransform=(rpc:Rpc,args:NodeTarget)=>call<Node3dTransformResult>(rpc,'node3d.inspect_transform',args);
export const setNode3dTransform=(rpc:Rpc,args:Node3dSetTransformInput)=>call<Node3dTransformResult>(rpc,'node3d.set_transform',args);
export const inspectMesh3d=(rpc:Rpc,args:NodeTarget)=>call<Mesh3dResult>(rpc,'mesh3d.inspect',args);
export const setMesh3dPrimitive=(rpc:Rpc,args:Mesh3dSetPrimitiveInput)=>call<Mesh3dResult>(rpc,'mesh3d.set_primitive',args);
export const inspectCamera3d=(rpc:Rpc,args:NodeTarget)=>call<Camera3dResult>(rpc,'camera3d.inspect',args);
export const configureCamera3d=(rpc:Rpc,args:Camera3dConfigureInput)=>call<Camera3dResult>(rpc,'camera3d.configure',args);
export const inspectCollision3d=(rpc:Rpc,args:NodeTarget)=>call<Collision3dResult>(rpc,'collision3d.inspect',args);
export const setCollision3dShape=(rpc:Rpc,args:Collision3dSetShapeInput)=>call<Collision3dResult>(rpc,'collision3d.set_shape',args);
export const inspectLight3d=(rpc:Rpc,args:NodeTarget)=>call<Light3dResult>(rpc,'light3d.inspect',args);
export const configureLight3d=(rpc:Rpc,args:Light3dConfigureInput)=>call<Light3dResult>(rpc,'light3d.configure',args);
