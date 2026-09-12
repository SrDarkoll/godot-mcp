import * as z from 'zod/v4';
import { RecoveryPathSchema } from '@godot-mcp/protocol';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import type { HeadlessValidator } from '../project/headless-validator.js';
import { toolSuccess } from '../mcp/tool-result.js';
export function registerProjectValidationTools(
  server: ToolRegistrar,
  validator: HeadlessValidator,
) {
  server.registerTool(
    'project.validate',
    {
      description:
        'Import and validate a retained project copy with headless Godot, without an editor connection. Source scripts are trusted, not sandboxed. Unsupported types and incomplete runs are explicit.',
      inputSchema: z.strictObject({
        paths: z.array(RecoveryPathSchema).max(512).default([]),
        timeout_ms: z.number().int().min(1000).max(120000).default(60000),
        max_project_bytes: z
          .number()
          .int()
          .min(1024)
          .max(1024 ** 3)
          .default(256 * 1024 * 1024),
      }),
    },
    async (args) => {
      const report = await validator.validate(args);
      return { ...toolSuccess(report), ...(!report.complete ? { isError: true } : {}) };
    },
  );
}
