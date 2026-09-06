import { ToolDiscoveryParamsSchema, type ToolDiscoveryParams, type ToolDiscoveryResult } from '@godot-mcp/protocol';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { bindCanonicalTool, defineCanonicalToolBinding } from '../tooling/canonical-tool-binding.js';
import type { ToolRegistry } from '../tooling/tool-registry.js';

export function discoverGodotTools(registry: ToolRegistry, args: ToolDiscoveryParams): ToolDiscoveryResult {
  return registry.discover(ToolDiscoveryParamsSchema.parse(args));
}

const godotToolsBinding = defineCanonicalToolBinding('godot.tools', {
  inputSchema: ToolDiscoveryParamsSchema,
  handler: discoverGodotTools
});

export function registerToolingTools(registrar:ToolRegistrar,registry:ToolRegistry):void {
  bindCanonicalTool(registrar, godotToolsBinding, registry);
}
