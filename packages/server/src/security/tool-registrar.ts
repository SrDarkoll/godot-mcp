import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ToolPolicy } from './tool-policy.js';
import { toolError } from '../mcp/tool-result.js';
import { getToolDefinition } from '../tools/tool-catalog.js';
import type { AddonCapabilities } from '@godot-mcp/protocol';
import { BridgeRpcError } from '../bridge/rpc-router.js';
export type ToolRegistrar = Pick<McpServer, 'registerTool'>;
export function guardedRegistrar(
  server: McpServer,
  policy: ToolPolicy,
  capabilities?: () => AddonCapabilities | null,
): ToolRegistrar {
  const registered = new Set<string>();
  const register = (name: string, config: any, handler: any) => {
    const definition = getToolDefinition(name);
    if (registered.has(name))
      throw new BridgeRpcError('DUPLICATE_TOOL', `Tool already registered: ${name}`);
    registered.add(name);
    return server.registerTool(
      name,
      {
        ...config,
        annotations: {
          ...config.annotations,
          readOnlyHint: definition.readOnly,
          destructiveHint: !definition.readOnly,
        },
        _meta: {
          ...config._meta,
          godot_mcp: {
            risk: definition.risk,
            permissions: definition.permissions,
            capabilities: definition.capabilities,
            control: definition.control,
            conditionalPermissions: true,
          },
        },
        inputSchema: config.inputSchema.extend({ confirmation: z.string().uuid().optional() }),
      },
      async (args: any, extra: any) => {
        try {
          return await policy.execute<any>(name, args, async (clean) => {
            const available = capabilities?.();
            const missing = available
              ? definition.capabilities.filter((capability) => !available[capability])
              : [];
            if (missing.length)
              throw new BridgeRpcError(
                'CAPABILITY_UNAVAILABLE',
                'Connected addon lacks required capabilities',
                { capabilities: missing },
              );
            return handler(clean, extra);
          });
        } catch (error) {
          return toolError(error);
        }
      },
    );
  };
  return { registerTool: register as McpServer['registerTool'] };
}
