import type {BridgeServer} from '../bridge/bridge-server.js';
import type {
  Material3dConfigureStandardInput,Material3dSetStandardInput,Material3dTargetInput,Shader3dSetCodeInput,Shader3dSetParameterInput
} from '@godot-mcp/protocol';
type Rpc=BridgeServer['rpc'];
export const inspectMaterial3d=(rpc:Rpc,args:Material3dTargetInput)=>rpc.call('material3d.inspect',args);
export const setStandardMaterial3d=(rpc:Rpc,args:Material3dSetStandardInput)=>rpc.call('material3d.set_standard',args);
export const configureStandardMaterial3d=(rpc:Rpc,args:Material3dConfigureStandardInput)=>rpc.call('material3d.configure_standard',args);
export const clearMaterial3d=(rpc:Rpc,args:Material3dTargetInput)=>rpc.call('material3d.clear',args);
export const inspectShader3d=(rpc:Rpc,args:Material3dTargetInput)=>rpc.call('shader3d.inspect',args);
export const setShader3dCode=(rpc:Rpc,args:Shader3dSetCodeInput)=>rpc.call('shader3d.set_code',args);
export const setShader3dParameter=(rpc:Rpc,args:Shader3dSetParameterInput)=>rpc.call('shader3d.set_parameter',args);
