import type {McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {ScenePathSchema,RuntimeTreeParamsSchema,RuntimeInspectParamsSchema,RuntimePropertyParamsSchema} from '@godot-mcp/protocol';
import type {RuntimeService} from '../runtime/runtime-service.js';
import {toolSuccess,toolError} from '../mcp/tool-result.js';
export function registerRuntimeTools(server:Pick<McpServer,'registerTool'>,runtime:RuntimeService):void {
  const register=(name:string,schema:z.ZodObject<any>,handler:(args:any)=>Promise<object>)=>{
    server.registerTool(name,{description:`Structured Godot ${name} operation on the current runtime session.`,inputSchema:schema},async args=>{
      try{return toolSuccess(await handler(args));}catch(error){return toolError(error);}
    });
  };
  register('project.run',z.strictObject({}),()=>runtime.run({target:'main'}));
  register('project.run_scene',z.strictObject({path:ScenePathSchema.optional()}),args=>runtime.run(args.path?{target:'path',path:args.path}:{target:'current'}));
  register('project.stop',z.strictObject({}),()=>runtime.stop());
  register('runtime.stop',z.strictObject({}),()=>runtime.stop());
  register('runtime.restart',z.strictObject({}),()=>runtime.restart());
  register('runtime.status',z.strictObject({}),()=>runtime.status());
  register('runtime.scene_tree',RuntimeTreeParamsSchema,args=>runtime.request('runtime.scene_tree',args));
  register('runtime.inspect_node',RuntimeInspectParamsSchema,args=>runtime.request('runtime.inspect_node',args));
  register('runtime.get_property',RuntimePropertyParamsSchema,args=>runtime.request('runtime.get_property',args));
  register('runtime.pause',z.strictObject({}),()=>runtime.request('runtime.pause'));
  register('runtime.resume',z.strictObject({}),()=>runtime.request('runtime.resume'));
}
