import * as z from 'zod/v4';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import type { ToolPolicy } from '../security/tool-policy.js';
import type { SessionStore } from '../session/session-store.js';
import { exportSession } from '../session/session-export.js';
import { toolSuccess } from '../mcp/tool-result.js';
export function registerObservabilityTools(
  server: ToolRegistrar,
  policy: ToolPolicy,
  sessions: SessionStore,
  id: string,
): void {
  server.registerTool(
    'session.metrics',
    {
      description:
        'Read bounded per-tool latency/failure samples, queue state, Node memory, disconnects and observed session bytes. Quota warnings never delete evidence.',
      inputSchema: z.strictObject({
        quota_bytes: z
          .number()
          .int()
          .min(1)
          .max(1024 ** 4)
          .default(1024 ** 3),
      }),
    },
    async (args) => toolSuccess(await policy.metrics(args.quota_bytes)),
  );
  server.registerTool(
    'session.export',
    {
      description:
        'Retain a hashed metadata bundle. Logs, screenshots and raw snapshots require explicit inclusion; review private data before sharing. No files are deleted.',
      inputSchema: z.strictObject({
        include_logs: z.boolean().default(false),
        include_screenshots: z.boolean().default(false),
        include_snapshots: z.boolean().default(false),
        max_bytes: z
          .number()
          .int()
          .min(1024)
          .max(128 * 1024 * 1024)
          .default(32 * 1024 * 1024),
      }),
    },
    async (args) => toolSuccess(await exportSession(sessions, id, await policy.metrics(), args)),
  );
}
