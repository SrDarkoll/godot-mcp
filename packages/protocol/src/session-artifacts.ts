import * as z from 'zod/v4';
import { MAX_CAPTURE_BYTES, VisualReasonSchema } from './visual.js';
import {RuntimeRunSchema} from './runtime.js';
import {FileCheckpointSchema} from './recovery.js';

export const ScreenshotRecordSchema = z.strictObject({
  id: z.uuid(), sequence: z.number().int().positive(), type: z.enum(['editor_2d','editor_3d','game']),
  runId:z.uuid().nullable().default(null),
  path: z.string().regex(/^screenshots\/(editor|game)\/\d{4,}_[a-z0-9_-]{1,48}\.png$/),
  scene: z.string().nullable(), reason: VisualReasonSchema, label: z.string().min(1).max(80),
  transaction: z.null(), timestamp: z.iso.datetime(), width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096), byteLength: z.number().int().positive().max(MAX_CAPTURE_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), viewportIndex: z.number().int().min(0).max(3).nullable()
}).refine(s=>s.type==='game' ? s.runId!==null&&s.viewportIndex===null&&s.path.startsWith('screenshots/game/') : s.runId===null&&s.path.startsWith('screenshots/editor/'));
export const VisualCheckpointRecordSchema = z.strictObject({
  id: z.uuid(), kind: z.literal('visual'), screenshotId: z.uuid(), timestamp: z.iso.datetime(),
  label: z.string().min(1).max(80)
});
export const SessionManifestSchema = z.strictObject({
  manifestVersion: z.literal(1), sessionId: z.string().min(1), projectRoot: z.string().min(1),
  startedAt: z.iso.datetime(), endedAt: z.iso.datetime().nullable(),
  godotVersion: z.string().nullable(), addonVersion: z.string().nullable(), protocolVersion: z.literal(1),
  nextScreenshotSequence: z.number().int().positive(), screenshots: z.array(ScreenshotRecordSchema),
  runtimeRuns:z.array(RuntimeRunSchema).default([]),
  checkpoints: z.array(z.discriminatedUnion('kind',[VisualCheckpointRecordSchema,FileCheckpointSchema])), transactions: z.array(z.record(z.string(),z.json())),
  permissionChanges: z.array(z.record(z.string(),z.json())),
  errors: z.array(z.strictObject({timestamp:z.iso.datetime(),tool:z.string(),code:z.string(),message:z.string()}))
}).superRefine((value, ctx) => {
  const ids = new Set(value.screenshots.map(s => s.id));
  const sequences = new Set(value.screenshots.map(s => s.sequence));
  if (ids.size !== value.screenshots.length || sequences.size !== value.screenshots.length ||
      value.screenshots.some(s => s.sequence >= value.nextScreenshotSequence) ||
      value.checkpoints.some(c => c.kind==='visual'&&!ids.has(c.screenshotId))) {
    ctx.addIssue({code:'custom',message:'Inconsistent screenshot index or checkpoint reference'});
  }
});
export const CaptureResultSchema = z.strictObject({
  sessionId:z.string(), screenshot:ScreenshotRecordSchema, checkpoint:VisualCheckpointRecordSchema.nullable()
});
export type ScreenshotRecord = z.infer<typeof ScreenshotRecordSchema>;
export type VisualCheckpointRecord = z.infer<typeof VisualCheckpointRecordSchema>;
export type CaptureResult = z.infer<typeof CaptureResultSchema>;
export type SessionManifest = z.infer<typeof SessionManifestSchema>;
