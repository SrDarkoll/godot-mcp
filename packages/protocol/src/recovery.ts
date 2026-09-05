import * as z from 'zod/v4';
export const RecoveryPathSchema=z.string().min(7).max(1024).refine(value=>{
 if(!value.startsWith('res://'))return false;
 const parts=value.slice(6).split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||/[<>:"\\|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)||['.git','.godot','.godot-mcp','.codex','.agents'].includes(p.toLowerCase())))return false;
 return !value.toLowerCase().startsWith('res://addons/godot_mcp/');
},'Only ordinary project files outside protected metadata are allowed');
export const RecoveryPathsSchema=z.array(RecoveryPathSchema).min(1).max(64).refine(paths=>new Set(paths.map(p=>p.toLowerCase())).size===paths.length,'Duplicate paths');
export const TransactionBeginSchema=z.strictObject({label:z.string().trim().min(1).max(120),paths:RecoveryPathsSchema,atomic:z.literal(true).default(true)});
export const SnapshotEntrySchema=z.strictObject({path:RecoveryPathSchema,exists:z.boolean(),hash:z.string().regex(/^[a-f0-9]{64}$/).nullable(),size:z.number().int().nonnegative().max(16*1024*1024),blob:z.string().regex(/^[a-f0-9-]+\.bin$/).nullable()}).refine(e=>e.exists?(e.hash!==null&&e.blob!==null):(e.hash===null&&e.blob===null&&e.size===0));
export const RecoveryStateSchema=z.enum(['open','applying','committed','rolling_back','rolled_back','recovery_required','snapshot']);
export const RecoveryRecordSchema=z.strictObject({id:z.uuid(),sessionId:z.string().min(1),kind:z.enum(['transaction','checkpoint','restore']),label:z.string().min(1).max(120),state:RecoveryStateSchema,createdAt:z.iso.datetime(),revision:z.number().int().nonnegative(),before:z.array(SnapshotEntrySchema).min(1).max(64),after:z.array(SnapshotEntrySchema).max(64),validation:z.object({valid:z.boolean(),errors:z.array(z.string())}).nullable()}).refine(record=>{
 const before=new Set(record.before.map(e=>e.path.toLowerCase()));const after=new Set(record.after.map(e=>e.path.toLowerCase()));
 return before.size===record.before.length&&after.size===record.after.length&&record.after.every(e=>before.has(e.path.toLowerCase()))&&record.before.reduce((n,e)=>n+e.size,0)<=128*1024*1024&&record.after.reduce((n,e)=>n+e.size,0)<=128*1024*1024;
},'Invalid snapshot scope or total size');
export const FileCheckpointSchema=z.strictObject({id:z.uuid(),kind:z.literal('files'),label:z.string(),timestamp:z.iso.datetime(),paths:RecoveryPathsSchema});
export type SnapshotEntry=z.infer<typeof SnapshotEntrySchema>;
export type RecoveryRecord=z.infer<typeof RecoveryRecordSchema>;
export type FileCheckpoint=z.infer<typeof FileCheckpointSchema>;
