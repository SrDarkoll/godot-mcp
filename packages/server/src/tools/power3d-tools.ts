import type {BridgeServer} from '../bridge/bridge-server.js';
import type {
  Camera3dConfigureInput,Collision3dSetShapeInput,Light3dConfigureInput,Mesh3dSetPrimitiveInput,Node3dSetTransformInput
} from '@godot-mcp/protocol';
type Rpc=BridgeServer['rpc'];
export const inspectNode3dTransform=(rpc:Rpc,args:{node_path:string})=>rpc.call('node3d.inspect_transform',args);
export const setNode3dTransform=(rpc:Rpc,args:Node3dSetTransformInput)=>rpc.call('node3d.set_transform',args);
export const inspectMesh3d=(rpc:Rpc,args:{node_path:string})=>rpc.call('mesh3d.inspect',args);
export const setMesh3dPrimitive=(rpc:Rpc,args:Mesh3dSetPrimitiveInput)=>rpc.call('mesh3d.set_primitive',args);
export const inspectCamera3d=(rpc:Rpc,args:{node_path:string})=>rpc.call('camera3d.inspect',args);
export const configureCamera3d=(rpc:Rpc,args:Camera3dConfigureInput)=>rpc.call('camera3d.configure',args);
export const inspectCollision3d=(rpc:Rpc,args:{node_path:string})=>rpc.call('collision3d.inspect',args);
export const setCollision3dShape=(rpc:Rpc,args:Collision3dSetShapeInput)=>rpc.call('collision3d.set_shape',args);
export const inspectLight3d=(rpc:Rpc,args:{node_path:string})=>rpc.call('light3d.inspect',args);
export const configureLight3d=(rpc:Rpc,args:Light3dConfigureInput)=>rpc.call('light3d.configure',args);
