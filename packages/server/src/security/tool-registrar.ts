import type {McpServer} from '@modelcontextprotocol/server';import * as z from 'zod/v4';
import {ToolPolicy} from './tool-policy.js';import {toolError} from '../mcp/tool-result.js';
export type ToolRegistrar=Pick<McpServer,'registerTool'>;
export function guardedRegistrar(server:McpServer,policy:ToolPolicy):ToolRegistrar{
 const register=(name:string,config:any,handler:any)=>server.registerTool(name,{...config,inputSchema:config.inputSchema.extend({confirmation:z.string().uuid().optional()})},async(args:any,extra:any)=>{
  try{return await policy.execute<any>(name,args,clean=>handler(clean,extra));}catch(error){return toolError(error);}
 });
 return {registerTool:register as McpServer['registerTool']};
}
