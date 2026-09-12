import * as z from 'zod/v4';
import { RecoveryPathSchema, RecoveryPathsSchema } from './recovery.js';
export const DependencyQuerySchema = z.strictObject({
  path: RecoveryPathSchema,
  recursive: z.boolean().default(false),
  max_nodes: z.number().int().min(1).max(1000).default(200),
  max_depth: z.number().int().min(0).max(32).default(8),
});
export const DependencyImpactSchema = z
  .strictObject({
    path: RecoveryPathSchema,
    action: z.enum(['move', 'delete']),
    target_path: RecoveryPathSchema.optional(),
    max_files: z.number().int().min(1).max(5000).default(1000),
  })
  .refine((v) => (v.action === 'delete' ? !v.target_path : !!v.target_path), {
    message: 'move requires target_path; delete does not accept it',
  });
export const ImportResourcesSchema = z.strictObject({
  paths: RecoveryPathsSchema,
  timeout_ms: z.number().int().min(1000).max(60000).default(15000),
});
