import {Material3dConfigureStandardSchema,Material3dSetStandardSchema,Material3dTargetSchema,Shader3dSetCodeSchema,Shader3dSetParameterSchema} from '@godot-mcp/protocol';
import type {BridgeServer} from '../bridge/bridge-server.js';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import {clearMaterial3d,configureStandardMaterial3d,inspectMaterial3d,inspectShader3d,setShader3dCode,setShader3dParameter,setStandardMaterial3d} from '../tools/material3d-tools.js';
import {omitUndefinedValues} from './omit-undefined.js';
import {toolError,toolSuccess} from './tool-result.js';
export function registerMaterial3dTools(registrar:ToolRegistrar,rpc:BridgeServer['rpc']):void{
  registrar.registerTool('material3d.inspect',{description:'Inspect a MeshInstance3D material override or surface override.',inputSchema:Material3dTargetSchema},async args=>{try{return toolSuccess(await inspectMaterial3d(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('material3d.set_standard',{description:'Create and assign a fresh embedded StandardMaterial3D.',inputSchema:Material3dSetStandardSchema},async args=>{try{return toolSuccess(await setStandardMaterial3d(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('material3d.configure_standard',{description:'Copy-on-write configure the selected StandardMaterial3D.',inputSchema:Material3dConfigureStandardSchema},async args=>{try{return toolSuccess(await configureStandardMaterial3d(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('material3d.clear',{description:'Clear the selected MeshInstance3D material override with Undo/Redo.',inputSchema:Material3dTargetSchema},async args=>{try{return toolSuccess(await clearMaterial3d(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('shader3d.inspect',{description:'Inspect spatial ShaderMaterial code, uniforms and current parameters.',inputSchema:Material3dTargetSchema},async args=>{try{return toolSuccess(await inspectShader3d(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('shader3d.set_code',{description:'Create or copy-on-write update an embedded spatial ShaderMaterial.',inputSchema:Shader3dSetCodeSchema},async args=>{try{return toolSuccess(await setShader3dCode(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('shader3d.set_parameter',{description:'Copy-on-write set a declared spatial shader uniform using canonical Variant encoding.',inputSchema:Shader3dSetParameterSchema},async args=>{try{return toolSuccess(await setShader3dParameter(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
}
