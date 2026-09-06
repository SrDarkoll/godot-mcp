import { ToolDiscoveryParamsSchema } from '@godot-mcp/protocol';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import type { ToolRegistry } from '../tooling/tool-registry.js';
import { toolSuccess } from './tool-result.js';

export function registerToolingTools(registrar:ToolRegistrar,registry:ToolRegistry):void {
  registrar.registerTool('godot.tools',{
    description:'Discover bounded Godot MCP tool metadata and profile membership without exposing tool schemas or handlers.',
    inputSchema:ToolDiscoveryParamsSchema
  },async args=>toolSuccess(registry.discover(ToolDiscoveryParamsSchema.parse(args))));
}
