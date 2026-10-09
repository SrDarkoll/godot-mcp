import * as z from 'zod/v4';
export const RunStateSchema=z.enum(['stopped','starting','running','paused','breaked','stopping','disconnected','failed']);
export const RuntimeFeaturesSchema=z.strictObject({inspect:z.boolean(),scenePause:z.boolean(),gameCapture:z.boolean(),diagnostics:z.boolean(),performance:z.boolean()});
export const NO_RUNTIME_FEATURES={inspect:false,scenePause:false,gameCapture:false,diagnostics:false,performance:false};
export const RuntimeStartupSchema=z.strictObject({phase:z.enum(['preparing','scene_validation','launching','ready','bridge_timeout','process_stopped','failed']),processState:z.enum(['not_started','editor_playing','editor_stopped','unknown']),exitCode:z.number().int().nullable(),logPath:z.string().max(2048).nullable()});
export const RuntimeStatusSchema=z.strictObject({state:RunStateSchema,runId:z.uuid().nullable(),scenePath:z.string().nullable(),connected:z.boolean(),ownership:z.enum(['none','session','external']),features:RuntimeFeaturesSchema,errorCode:z.string().nullable(),startup:RuntimeStartupSchema.optional()});
export const ScenePathSchema=z.string().max(1024).regex(/^res:\/\/.+\.(tscn|scn)$/).refine(p=>!p.includes('..')&&!p.includes('\\')&&!p.includes('\0')&&!p.slice(6).includes(':')&&!p.slice(6).includes('//'));
export const RunTargetSchema=z.discriminatedUnion('target',[
  z.strictObject({target:z.literal('main')}),z.strictObject({target:z.literal('current')}),z.strictObject({target:z.literal('path'),path:ScenePathSchema})
]);
export const RuntimeNodeParamsSchema=z.strictObject({node_path:z.string().min(1).max(1024).refine(p=>p.startsWith('/root/')&&!p.includes('..')&&!p.includes('\\')&&!p.includes('\0')&&!p.startsWith('/root/GodotMcpRuntime'))});
export const RuntimeTreeParamsSchema=z.strictObject({max_depth:z.number().int().min(0).max(32).default(16),max_nodes:z.number().int().min(1).max(2000).default(500)});
export const RuntimePropertyParamsSchema=RuntimeNodeParamsSchema.extend({property:z.string().min(1).max(256)});
export const RuntimeInspectParamsSchema=RuntimeNodeParamsSchema.extend({properties:z.array(z.string().min(1).max(256)).max(64).default([])});
export const DiagnosticQuerySchema=z.strictObject({run_id:z.uuid().optional(),after:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(200).default(100)});
export const RuntimeRunSchema=z.strictObject({runId:z.uuid(),scenePath:z.string().nullable(),startedAt:z.iso.datetime(),endedAt:z.iso.datetime().nullable(),state:RunStateSchema,logPath:z.string().regex(/^logs\/runtime\/[a-f0-9-]{36}\.jsonl$/),diagnosticsComplete:z.boolean(),persistenceTruncated:z.boolean(),startupLogPath:z.string().regex(/^logs\/runtime\/[a-f0-9-]{36}\.boot\.log$/).optional()});
export type RuntimeStatus=z.infer<typeof RuntimeStatusSchema>;
export type RunTarget=z.infer<typeof RunTargetSchema>;
export type RuntimeRun=z.infer<typeof RuntimeRunSchema>;
