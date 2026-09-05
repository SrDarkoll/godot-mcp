import * as z from 'zod/v4';import {PermissionSchema,PermissionChangeSchema} from '@godot-mcp/protocol';
import type {ToolRegistrar} from '../security/tool-registrar.js';import type {ToolPolicy} from '../security/tool-policy.js';import {toolSuccess,toolError} from '../mcp/tool-result.js';
export function registerSecurityTools(server:ToolRegistrar,policy:ToolPolicy):void{
 server.registerTool('permissions.status',{description:'Session-only tool permissions. These do not sandbox project code or add missing capabilities.',inputSchema:z.strictObject({})},async()=>toolSuccess({permissions:policy.permissions(),scope:'session'}));
 server.registerTool('permissions.set',{description:'Change a permission for this MCP session only.',inputSchema:PermissionChangeSchema},async a=>{try{return toolSuccess(await policy.setPermission(a.permission,a.enabled));}catch(e){return toolError(e);}});
 for(const name of ['permissions.enable','permissions.disable'])server.registerTool(name,{description:'Change a session-only permission.',inputSchema:z.strictObject({permission:PermissionSchema})},async a=>{try{return toolSuccess(await policy.setPermission(a.permission,name==='permissions.enable'));}catch(e){return toolError(e);}});
 server.registerTool('risk.preview',{description:'Read the risk, targets and required permissions of an operation without executing it.',inputSchema:z.strictObject({tool:z.string().min(1).max(100),arguments:z.record(z.string(),z.unknown()).default({})})},async a=>{try{return toolSuccess(await policy.assess(a.tool,a.arguments));}catch(e){return toolError(e);}});
}
