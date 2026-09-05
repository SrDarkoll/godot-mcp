import * as z from 'zod/v4';
export const DiagnosticEntrySchema=z.strictObject({sequence:z.number().int().positive(),runId:z.uuid(),timestamp:z.iso.datetime(),kind:z.enum(['output','error','warning']),stream:z.enum(['stdout','stderr']).nullable(),message:z.string().max(4096),file:z.string().max(1024).nullable(),line:z.number().int().nonnegative().nullable(),frames:z.array(z.strictObject({file:z.string().max(1024),line:z.number().int().nonnegative(),function:z.string().max(256)})).max(32),truncated:z.boolean()});
export const DiagnosticBatchSchema=z.strictObject({runId:z.uuid(),entries:z.array(DiagnosticEntrySchema).max(50),dropped:z.number().int().nonnegative()}).refine(b=>b.entries.every(e=>e.runId===b.runId));
export interface DiagnosticPage {runId:string;entries:DiagnosticEntry[];nextCursor:number;oldestAvailable:number;dropped:number;truncated:boolean;}
export type DiagnosticEntry=z.infer<typeof DiagnosticEntrySchema>;
export type DiagnosticBatch=z.infer<typeof DiagnosticBatchSchema>;
