import * as z from 'zod/v4';

export const MAX_HEADLESS_OUTPUT_BYTES = 512 * 1024;
export const MAX_HEADLESS_JOB_TIMEOUT_MS = 600_000;

export const HeadlessExecutionKindSchema = z.enum([
  'validate_project', 'import', 'run', 'run_scene', 'run_tests'
]);
export const HeadlessExecutionStateSchema = z.enum(['starting','running','stopping','exited','failed']);
export const HeadlessExecutionRecordSchema = z.strictObject({
  executionId:z.uuid(),
  kind:HeadlessExecutionKindSchema,
  state:HeadlessExecutionStateSchema,
  startedAt:z.iso.datetime(),
  endedAt:z.iso.datetime().nullable(),
  exitCode:z.number().int().nullable(),
  signal:z.string().nullable(),
  pid:z.number().int().positive().nullable(),
  scenePath:z.string().nullable(),
  scriptPath:z.string().nullable(),
  logPath:z.string().regex(/^logs\/headless\/[0-9a-f-]{36}\.jsonl$/),
  outputBytes:z.number().int().nonnegative().max(MAX_HEADLESS_OUTPUT_BYTES),
  outputTruncated:z.boolean(),
  timedOut:z.boolean(),
  stoppedByRequest:z.boolean(),
  errorCode:z.string().nullable()
});

const HeadlessTimeoutSchema = z.number().int().min(1).max(MAX_HEADLESS_JOB_TIMEOUT_MS);
export const HeadlessValidateProjectSchema = z.strictObject({timeout_ms:HeadlessTimeoutSchema.default(60_000)});
export const HeadlessImportSchema = z.strictObject({timeout_ms:HeadlessTimeoutSchema.default(180_000)});
export const HeadlessRunSchema = z.strictObject({});
export const HeadlessRunSceneSchema = z.strictObject({scene_path:z.string().min(1).max(1024)});
export const HeadlessRunTestsSchema = z.strictObject({script_path:z.string().min(1).max(1024),timeout_ms:HeadlessTimeoutSchema.default(120_000)});
export const HeadlessStatusSchema = z.strictObject({});
export const HeadlessStopSchema = z.strictObject({});
export const HeadlessGetOutputSchema = z.strictObject({
  execution_id:z.uuid().optional(),
  after:z.number().int().nonnegative().default(0),
  limit:z.number().int().min(1).max(200).default(100)
});

export const HeadlessOutputEntrySchema = z.strictObject({
  sequence:z.number().int().positive(),
  timestamp:z.iso.datetime(),
  stream:z.enum(['stdout','stderr']),
  text:z.string()
});
export const HeadlessStatusResultSchema = z.strictObject({
  godotAvailable:z.boolean(),
  active:HeadlessExecutionRecordSchema.nullable(),
  last:HeadlessExecutionRecordSchema.nullable()
});
export const HeadlessOutputPageSchema = z.strictObject({
  executionId:z.uuid(),
  entries:z.array(HeadlessOutputEntrySchema).max(200),
  nextCursor:z.number().int().nonnegative(),
  truncated:z.boolean(),
  exitCode:z.number().int().nullable(),
  state:HeadlessExecutionStateSchema
});
export const HeadlessStopResultSchema = z.strictObject({
  stopped:z.boolean(),
  execution:HeadlessExecutionRecordSchema.nullable()
});

export type HeadlessExecutionKind = z.infer<typeof HeadlessExecutionKindSchema>;
export type HeadlessExecutionState = z.infer<typeof HeadlessExecutionStateSchema>;
export type HeadlessExecutionRecord = z.infer<typeof HeadlessExecutionRecordSchema>;
export type HeadlessValidateProjectParams = z.infer<typeof HeadlessValidateProjectSchema>;
export type HeadlessImportParams = z.infer<typeof HeadlessImportSchema>;
export type HeadlessRunParams = z.infer<typeof HeadlessRunSchema>;
export type HeadlessRunSceneParams = z.infer<typeof HeadlessRunSceneSchema>;
export type HeadlessRunTestsParams = z.infer<typeof HeadlessRunTestsSchema>;
export type HeadlessStatusParams = z.infer<typeof HeadlessStatusSchema>;
export type HeadlessStopParams = z.infer<typeof HeadlessStopSchema>;
export type HeadlessGetOutputParams = z.infer<typeof HeadlessGetOutputSchema>;
export type HeadlessOutputEntry = z.infer<typeof HeadlessOutputEntrySchema>;
export type HeadlessStatusResult = z.infer<typeof HeadlessStatusResultSchema>;
export type HeadlessOutputPage = z.infer<typeof HeadlessOutputPageSchema>;
export type HeadlessStopResult = z.infer<typeof HeadlessStopResultSchema>;
