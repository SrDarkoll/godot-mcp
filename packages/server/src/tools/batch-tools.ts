import type { ToolRegistrar } from '../security/tool-registrar.js';
import { BatchPreviewSchema, BatchApplySchema } from '@godot-mcp/protocol';
import type { RecoveryService } from '../recovery/recovery-service.js';
import type { RpcRouter } from '../bridge/rpc-router.js';
import { toolSuccess } from '../mcp/tool-result.js';
import { checkBatchValueShape } from './batch-values.js';
export function registerBatchTools(
  server: ToolRegistrar,
  recovery: RecoveryService,
  rpc: Pick<RpcRouter, 'call'>,
) {
  const checkResources = async (value: unknown, plainVectors = true): Promise<void> => {
    if (Array.isArray(value)) {
      for (const item of value) await checkResources(item, plainVectors);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const entry = value as Record<string, unknown>;
    checkBatchValueShape(entry, plainVectors);
    if (entry.op === 'resource_set_property') await recovery.files.resolve(String(entry.path));
    if (entry.type === 'Resource' && entry.value && typeof entry.value === 'object')
      await recovery.files.resolve(String((entry.value as Record<string, unknown>).path));
    const nestedPlain =
      plainVectors && !(typeof entry.type === 'string' && Object.hasOwn(entry, 'value'));
    for (const item of Object.values(entry)) await checkResources(item, nestedPlain);
  };
  server.registerTool(
    'scene.batch.preview',
    {
      description:
        'Prevalidate a bounded native scene/resource batch and obtain its exact state/operation fingerprint. Paths resolve against the initial scene; @id references nodes created in this batch.',
      inputSchema: BatchPreviewSchema,
    },
    async (args) => {
      await checkResources(args);
      return toolSuccess((await rpc.call('scene.batch.preview', args)) as object);
    },
  );
  server.registerTool(
    'scene.batch',
    {
      description:
        'Apply a prevalidated native batch as one editor Undo action. Requires the fingerprint from preview. Does not save files; arbitrary project-script side effects are outside native Undo.',
      inputSchema: BatchApplySchema,
    },
    async (args) => {
      await checkResources(args);
      return toolSuccess((await rpc.call('scene.batch', args, 10000)) as object);
    },
  );
}
