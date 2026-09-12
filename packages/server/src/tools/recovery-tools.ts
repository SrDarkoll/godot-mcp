import * as z from 'zod/v4';
import {
  TransactionBeginSchema,
  RecoveryPathSchema,
  RecoveryPathsSchema,
} from '@godot-mcp/protocol';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import type { RecoveryService } from '../recovery/recovery-service.js';
import type { RpcRouter } from '../bridge/rpc-router.js';
import { toolSuccess, toolError } from '../mcp/tool-result.js';
export function registerRecoveryTools(
  server: ToolRegistrar,
  recovery: RecoveryService,
  rpc: Pick<RpcRouter, 'call'>,
): void {
  const id = z.string().uuid();
  const session = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z_[a-f0-9]{8}$/);
  const register = (
    name: string,
    inputSchema: z.ZodObject<any>,
    handler: (args: any) => Promise<object>,
  ) =>
    server.registerTool(
      name,
      {
        description: `${name}: declared on-disk file recovery with retained snapshots.`,
        inputSchema,
      },
      async (args) => {
        try {
          return toolSuccess(await handler(args));
        } catch (error) {
          return toolError(error);
        }
      },
    );
  register('transaction.begin', TransactionBeginSchema, (args) => recovery.begin(args));
  register(
    'transaction.write_file',
    z.strictObject({
      transaction_id: id,
      path: RecoveryPathSchema,
      content: z.string().max(4 * 1024 * 1024),
    }),
    (a) => recovery.write(a.transaction_id, a.path, a.content),
  );
  register(
    'transaction.delete_file',
    z.strictObject({ transaction_id: id, path: RecoveryPathSchema }),
    (a) => recovery.remove(a.transaction_id, a.path),
  );
  register('transaction.preview', z.strictObject({ transaction_id: id }), (a) =>
    recovery.preview(a.transaction_id),
  );
  register(
    'transaction.diff',
    z.strictObject({
      transaction_id: id,
      session_id: session.optional(),
      redact: z.boolean().default(true),
      context_lines: z.number().int().min(0).max(10).default(3),
      max_lines: z.number().int().min(1).max(2000).default(200),
      max_diff_bytes: z
        .number()
        .int()
        .min(256)
        .max(256 * 1024)
        .default(64 * 1024),
    }),
    (a) => recovery.diff(a.transaction_id, a, a.session_id),
  );
  server.registerTool(
    'transaction.commit',
    {
      description:
        'Publish and validate staged files; failed validation triggers exact-byte compensation.',
      inputSchema: z.strictObject({ transaction_id: id }),
    },
    async (a) => {
      try {
        const result = await recovery.commit(a.transaction_id);
        return {
          ...toolSuccess(result),
          ...(result.state === 'rolled_back' && result.validation?.valid === false
            ? { isError: true }
            : {}),
        };
      } catch (e) {
        return toolError(e);
      }
    },
  );
  register('transaction.rollback', z.strictObject({ transaction_id: id }), (a) =>
    recovery.rollback(a.transaction_id),
  );
  register(
    'transaction.recover',
    z.strictObject({ transaction_id: id, session_id: session, force: z.boolean().default(false) }),
    (a) => recovery.recover(a.session_id, a.transaction_id, a.force),
  );
  register(
    'transaction.status',
    z.strictObject({ transaction_id: id.optional(), session_id: session.optional() }),
    (a) => recovery.status(a.transaction_id, a.session_id),
  );
  register(
    'checkpoint.create',
    z.strictObject({ label: z.string().trim().min(1).max(120), paths: RecoveryPathsSchema }),
    (a) => recovery.createCheckpoint(a.label, a.paths),
  );
  register('checkpoint.list', z.strictObject({ session_id: session.optional() }), async (a) => ({
    checkpoints: await recovery.listCheckpoints(a.session_id),
  }));
  register(
    'checkpoint.inspect',
    z.strictObject({ checkpoint_id: id, session_id: session.optional() }),
    (a) => recovery.inspectCheckpoint(a.checkpoint_id, a.session_id),
  );
  register(
    'checkpoint.restore',
    z.strictObject({ checkpoint_id: id, session_id: session.optional() }),
    (a) => recovery.restoreCheckpoint(a.checkpoint_id, a.session_id),
  );
  register(
    'editor.close_scene',
    z.strictObject({}),
    async () => (await rpc.call('editor.close_scene', {})) as object,
  );
}
