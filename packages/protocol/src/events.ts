import * as z from 'zod/v4';
import { RuntimeStatusSchema } from './runtime.js';
import { DiagnosticBatchSchema } from './diagnostics.js';
const envelope = {
  type: z.literal('event'),
  protocol: z.literal(1),
  sessionId: z.string().min(1),
  sequence: z.number().int().positive(),
};
export const BridgeRuntimeEventSchema = z.discriminatedUnion('event', [
  z.strictObject({ ...envelope, event: z.literal('runtime.state'), data: RuntimeStatusSchema }),
  z.strictObject({
    ...envelope,
    event: z.literal('runtime.diagnostics'),
    data: DiagnosticBatchSchema,
  }),
]);
export type BridgeRuntimeEvent = z.infer<typeof BridgeRuntimeEventSchema>;
export const BridgeProjectEventSchema = z.strictObject({
  ...envelope,
  event: z.literal('project.changed'),
  data: z.strictObject({
    kind: z.enum(['scene.changed', 'scene.saved', 'filesystem.changed', 'import.finished']),
    path: z.string().max(1024).nullable(),
    dropped: z.number().int().nonnegative(),
  }),
});
