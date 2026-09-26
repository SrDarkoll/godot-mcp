import { GeometryValidateSchema } from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { toolSuccess } from './tool-result.js';

export function registerGeometryTools(registrar: ToolRegistrar, rpc: Pick<RpcRouter, 'call'>): void {
  registrar.registerTool('geometry.validate_walkways', {
    description: 'Read the edited 2D scene and report full walkway-footprint collisions, endpoint gaps and unsupported geometry without saving or mutating it.',
    inputSchema: GeometryValidateSchema
  }, async args => toolSuccess((await rpc.call('geometry.validate_walkways', args, 10000)) as object));
}
