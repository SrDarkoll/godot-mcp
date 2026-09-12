import * as z from 'zod/v4';
import { RecoveryPathSchema } from './recovery.js';
const ref = z.string().min(1).max(1024);
const name = z.string().min(1).max(128);
export const BatchOperationSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('create'), id: name, type: name, name, parent: ref.default('.') }),
  z.strictObject({ op: z.literal('set_property'), node: ref, property: name, value: z.unknown() }),
  z.strictObject({
    op: z.literal('resource_set_property'),
    path: RecoveryPathSchema,
    property: name,
    value: z.unknown(),
  }),
  z.strictObject({ op: z.literal('rename'), node: ref, name }),
  z.strictObject({ op: z.literal('delete'), node: ref }),
  z.strictObject({ op: z.literal('reparent'), node: ref, parent: ref }),
  z.strictObject({ op: z.literal('move'), node: ref, index: z.number().int().min(0).max(10000) }),
]);
export const BatchPreviewSchema = z.strictObject({
  label: z.string().min(1).max(120).default('MCP batch'),
  operations: z.array(BatchOperationSchema).min(1).max(64),
});
export const BatchApplySchema = BatchPreviewSchema.extend({
  expected: z.string().regex(/^[a-f0-9]{64}$/),
});
