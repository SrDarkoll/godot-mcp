import {
  DependencyQuerySchema,
  DependencyImpactSchema,
  ImportResourcesSchema,
} from '@godot-mcp/protocol';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import type { RpcRouter } from '../bridge/rpc-router.js';
import type { RecoveryService } from '../recovery/recovery-service.js';
import { toolSuccess } from '../mcp/tool-result.js';
export function registerDependencyTools(
  server: ToolRegistrar,
  rpc: Pick<RpcRouter, 'call'>,
  recovery: RecoveryService,
) {
  server.registerTool(
    'resource.dependencies',
    {
      description:
        'Return a bounded direct/transitive dependency graph and broken references for an imported Godot resource.',
      inputSchema: DependencyQuerySchema,
    },
    async (a) => toolSuccess((await rpc.call('resource.dependencies', a)) as object),
  );
  server.registerTool(
    'resource.impact',
    {
      description:
        'Preflight inbound references and target conflicts before a proposed resource move/delete. This read does not mutate files.',
      inputSchema: DependencyImpactSchema,
    },
    async (a) => toolSuccess((await rpc.call('resource.impact', a)) as object),
  );
  server.registerTool(
    'editor.import_resources',
    {
      description:
        'Wait for the editor filesystem, then synchronously reimport declared project files. Importers/project code are trusted.',
      inputSchema: ImportResourcesSchema,
    },
    async (a) => {
      for (const p of a.paths) await recovery.files.resolve(p);
      return toolSuccess(
        (await rpc.call('editor.import_resources', a, a.timeout_ms + 3000)) as object,
      );
    },
  );
}
