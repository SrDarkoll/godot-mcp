import type {
  Material3dConfigureStandardInput,Material3dResult,Material3dSetStandardInput,Material3dTargetInput,Shader3dSetCodeInput,Shader3dSetParameterInput
} from '@godot-mcp/protocol';
import type {RpcRouter} from '../bridge/rpc-router.js';

type Rpc=Pick<RpcRouter,'call'>;
type Shader3dResult=Material3dResult & {shader:Record<string,unknown>};
const call=<T>(rpc:Rpc,name:string,params:object)=>rpc.call(name,params as Record<string,unknown>) as Promise<T>;
export const inspectMaterial3d=(rpc:Rpc,args:Material3dTargetInput)=>call<Material3dResult>(rpc,'material3d.inspect',args);
export const setStandardMaterial3d=(rpc:Rpc,args:Material3dSetStandardInput)=>call<Material3dResult>(rpc,'material3d.set_standard',args);
export const configureStandardMaterial3d=(rpc:Rpc,args:Material3dConfigureStandardInput)=>call<Material3dResult>(rpc,'material3d.configure_standard',args);
export const clearMaterial3d=(rpc:Rpc,args:Material3dTargetInput)=>call<Material3dResult>(rpc,'material3d.clear',args);
export const inspectShader3d=(rpc:Rpc,args:Material3dTargetInput)=>call<Shader3dResult>(rpc,'shader3d.inspect',args);
export const setShader3dCode=(rpc:Rpc,args:Shader3dSetCodeInput)=>call<Shader3dResult>(rpc,'shader3d.set_code',args);
export const setShader3dParameter=(rpc:Rpc,args:Shader3dSetParameterInput)=>call<Shader3dResult>(rpc,'shader3d.set_parameter',args);
