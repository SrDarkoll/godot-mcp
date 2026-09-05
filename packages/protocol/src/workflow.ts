import * as z from 'zod/v4';
import {DiagnosticEntrySchema} from './diagnostics.js';
import {FileCheckpointSchema} from './recovery.js';
import {RuntimeRunSchema,RuntimeStatusSchema,ScenePathSchema} from './runtime.js';
import {ScreenshotRecordSchema,VisualCheckpointRecordSchema} from './session-artifacts.js';

export const WorkflowCaptureModeSchema=z.enum(['none','game','editor_2d','editor_3d']);
export const WorkflowActiveSceneSchema=z.strictObject({
  path:z.string().nullable(),root_name:z.string().nullable(),root_type:z.string().nullable()
});
export const WorkflowDiagnosticSnapshotSchema=z.strictObject({
  runId:z.uuid(),cursor:z.number().int().nonnegative(),entries:z.array(DiagnosticEntrySchema).max(200),
  dropped:z.number().int().nonnegative(),truncated:z.boolean(),errorCount:z.number().int().nonnegative(),
  warningCount:z.number().int().nonnegative(),outputCount:z.number().int().nonnegative()
});
export const WorkflowManifestCursorSchema=z.strictObject({
  nextScreenshotSequence:z.number().int().positive(),errors:z.number().int().nonnegative(),
  transactions:z.number().int().nonnegative(),checkpoints:z.number().int().nonnegative(),runtimeRuns:z.number().int().nonnegative()
});
export const WorkflowSnapshotSchema=z.strictObject({
  id:z.uuid(),sessionId:z.string().min(1).max(128),label:z.string().trim().min(1).max(80),createdAt:z.iso.datetime(),
  activeScene:WorkflowActiveSceneSchema.nullable(),runtime:RuntimeStatusSchema,
  diagnostics:WorkflowDiagnosticSnapshotSchema.nullable(),screenshot:ScreenshotRecordSchema.nullable(),
  cursors:WorkflowManifestCursorSchema
});
export const WorkflowSnapshotParamsSchema=z.strictObject({
  label:z.string().trim().min(1).max(80).default('workflow_snapshot'),
  capture:WorkflowCaptureModeSchema.default('none'),viewport_index:z.number().int().min(0).max(3).default(0),
  checkpoint:z.boolean().default(true),diagnostic_limit:z.number().int().min(1).max(200).default(100)
});
export const WorkflowRunCheckParamsSchema=z.strictObject({
  target:z.enum(['main','current','path']).default('current'),path:ScenePathSchema.optional(),
  label:z.string().trim().min(1).max(80).default('run_check'),capture:z.boolean().default(true),
  checkpoint:z.boolean().default(true),settle_ms:z.number().int().min(0).max(5000).default(500),
  diagnostic_limit:z.number().int().min(1).max(200).default(100),include_performance:z.boolean().default(true)
}).superRefine((value,ctx)=>{
  if(value.target==='path'&&!value.path)ctx.addIssue({code:'custom',path:['path'],message:'path is required when target is path'});
  if(value.target!=='path'&&value.path)ctx.addIssue({code:'custom',path:['path'],message:'path is only valid when target is path'});
});
export const WorkflowDiffParamsSchema=z.strictObject({
  snapshot_id:z.uuid(),diagnostic_limit:z.number().int().min(1).max(200).default(100)
});
export const WorkflowObservationErrorSchema=z.strictObject({code:z.string().min(1).max(64),message:z.string().min(1).max(512)});
export const WorkflowVerdictSchema=z.enum(['pass','fail','inconclusive']);
export const WorkflowRunCheckResultSchema=z.strictObject({
  verdict:WorkflowVerdictSchema,snapshot:WorkflowSnapshotSchema,runtime:RuntimeStatusSchema,
  diagnostics:WorkflowDiagnosticSnapshotSchema.nullable(),performance:z.record(z.string(),z.json()).nullable(),
  observationErrors:z.array(WorkflowObservationErrorSchema).max(8),screenshot:ScreenshotRecordSchema.nullable()
});
export const WorkflowDiagnosticDeltaSchema=z.strictObject({
  runId:z.uuid().nullable(),entries:z.array(DiagnosticEntrySchema).max(200),nextCursor:z.number().int().nonnegative(),
  dropped:z.number().int().nonnegative(),truncated:z.boolean(),runChanged:z.boolean(),
  errorCount:z.number().int().nonnegative(),warningCount:z.number().int().nonnegative(),outputCount:z.number().int().nonnegative()
});
export const WorkflowSessionErrorSchema=z.strictObject({
  timestamp:z.iso.datetime(),tool:z.string(),code:z.string(),message:z.string()
});
export const WorkflowDiffResultSchema=z.strictObject({
  baseline:z.strictObject({id:z.uuid(),createdAt:z.iso.datetime()}),
  activeScene:z.strictObject({before:WorkflowActiveSceneSchema.nullable(),after:WorkflowActiveSceneSchema.nullable(),changed:z.boolean()}),
  runtime:z.strictObject({before:RuntimeStatusSchema,after:RuntimeStatusSchema,runChanged:z.boolean(),stateChanged:z.boolean()}),
  diagnostics:WorkflowDiagnosticDeltaSchema,
  screenshots:z.array(ScreenshotRecordSchema),errors:z.array(WorkflowSessionErrorSchema),
  transactions:z.array(z.record(z.string(),z.json())),
  checkpoints:z.array(z.discriminatedUnion('kind',[VisualCheckpointRecordSchema,FileCheckpointSchema])),
  runtimeRuns:z.array(RuntimeRunSchema)
});

export type WorkflowCaptureMode=z.infer<typeof WorkflowCaptureModeSchema>;
export type WorkflowActiveScene=z.infer<typeof WorkflowActiveSceneSchema>;
export type WorkflowSnapshot=z.infer<typeof WorkflowSnapshotSchema>;
export type WorkflowSnapshotParams=z.infer<typeof WorkflowSnapshotParamsSchema>;
export type WorkflowRunCheckParams=z.infer<typeof WorkflowRunCheckParamsSchema>;
export type WorkflowDiffParams=z.infer<typeof WorkflowDiffParamsSchema>;
export type WorkflowRunCheckResult=z.infer<typeof WorkflowRunCheckResultSchema>;
export type WorkflowDiffResult=z.infer<typeof WorkflowDiffResultSchema>;
export type WorkflowDiagnosticSnapshot=z.infer<typeof WorkflowDiagnosticSnapshotSchema>;
