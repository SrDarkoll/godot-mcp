import * as z from 'zod/v4';

export const DEFAULT_DEBUG_VARIABLE_PAGE=100;
export const MAX_DEBUG_VARIABLE_PAGE=500;
export const MAX_DEBUG_VALUE_CHARS=4096;

export const DebugBreakpointPathSchema=z.string().min(1).max(1024)
  .regex(/^res:\/\/.+\.gd$/)
  .refine(p=>!p.includes('..')&&!p.includes('\\')&&!p.includes('\0')&&!p.slice(6).includes(':')&&!p.slice(6).includes('//'));
const DebugLineSchema=z.number().int().min(1);
const EmptyDebugSchema=z.strictObject({});

export const DebugBreakpointSetSchema=z.strictObject({script_path:DebugBreakpointPathSchema,line:DebugLineSchema});
export const DebugBreakpointRemoveSchema=DebugBreakpointSetSchema;
export const DebugBreakpointListSchema=EmptyDebugSchema;
export const DebugStackSchema=EmptyDebugSchema;
export const DebugVariablesSchema=z.strictObject({frame_id:z.uuid()});
export const DebugExpandSchema=z.strictObject({
  variable_ref:z.uuid(),
  start:z.number().int().nonnegative().default(0),
  limit:z.number().int().min(1).max(MAX_DEBUG_VARIABLE_PAGE).default(DEFAULT_DEBUG_VARIABLE_PAGE)
});
export const DebugContinueSchema=EmptyDebugSchema;
export const DebugStepIntoSchema=EmptyDebugSchema;
export const DebugStepOverSchema=EmptyDebugSchema;
export const DebugStepOutSchema=EmptyDebugSchema;

export const DebugBreakpointSchema=z.strictObject({scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema});
export const DebugBreakpointSetResultSchema=z.strictObject({scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema,owned:z.literal(true),applied:z.boolean()});
export const DebugBreakpointRemoveResultSchema=z.strictObject({scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema,removed:z.literal(true)});
export const DebugBreakpointListResultSchema=z.strictObject({scope:z.literal('session_owned'),breakpoints:z.array(DebugBreakpointSchema).max(4096)});

export const DebugStackFrameSchema=z.strictObject({frameId:z.uuid(),name:z.string().max(1024),scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema,column:z.number().int().min(1)});
export const DebugStackResultSchema=z.strictObject({breakId:z.uuid(),frames:z.array(DebugStackFrameSchema).max(1024)});
export const DebugVariableSchema=z.strictObject({name:z.string().max(1024),type:z.string().max(1024),value:z.string().max(MAX_DEBUG_VALUE_CHARS),variableRef:z.uuid().nullable(),valueTruncated:z.boolean()});
export const DebugScopeSchema=z.strictObject({name:z.string().max(1024),variables:z.array(DebugVariableSchema).max(MAX_DEBUG_VARIABLE_PAGE)});
export const DebugVariablesResultSchema=z.strictObject({frameId:z.uuid(),scopes:z.array(DebugScopeSchema).max(64)});
export const DebugExpandResultSchema=z.strictObject({variableRef:z.uuid(),start:z.number().int().nonnegative(),entries:z.array(DebugVariableSchema).max(MAX_DEBUG_VARIABLE_PAGE),nextCursor:z.number().int().nonnegative().nullable()});
export const DebugControlActionSchema=z.enum(['continue','step_into','step_over','step_out']);
export const DebugControlResultSchema=z.strictObject({accepted:z.literal(true),runId:z.uuid(),action:DebugControlActionSchema});

export const DebuggerBreakpointSnapshotSchema=z.strictObject({breakpoints:z.array(DebugBreakpointSchema).max(4096)});
export const DebuggerBreakpointApplyResultSchema=z.strictObject({scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema,applied:z.boolean()});
export const DebuggerBreakpointRemoveBridgeResultSchema=z.strictObject({scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema,removed:z.boolean()});
export const DebuggerInfoResultSchema=z.strictObject({
  dapHost:z.literal('127.0.0.1'),dapPort:z.number().int().min(1024).max(65535),
  debugHost:z.literal('127.0.0.1'),debugPort:z.number().int().min(1024).max(65535),
  breakpointOwnerSessionId:z.string().min(1).max(256).nullable(),
  breakpoints:z.array(DebugBreakpointSchema).max(4096),
  mcpBreakpoints:z.array(DebugBreakpointSchema).max(4096)
});

export type DebugBreakpointSetParams=z.infer<typeof DebugBreakpointSetSchema>;
export type DebugBreakpointRemoveParams=z.infer<typeof DebugBreakpointRemoveSchema>;
export type DebugBreakpointListParams=z.infer<typeof DebugBreakpointListSchema>;
export type DebugStackParams=z.infer<typeof DebugStackSchema>;
export type DebugVariablesParams=z.infer<typeof DebugVariablesSchema>;
export type DebugExpandParams=z.infer<typeof DebugExpandSchema>;
export type DebugContinueParams=z.infer<typeof DebugContinueSchema>;
export type DebugStepIntoParams=z.infer<typeof DebugStepIntoSchema>;
export type DebugStepOverParams=z.infer<typeof DebugStepOverSchema>;
export type DebugStepOutParams=z.infer<typeof DebugStepOutSchema>;
export type DebugBreakpoint=z.infer<typeof DebugBreakpointSchema>;
export type DebugBreakpointSetResult=z.infer<typeof DebugBreakpointSetResultSchema>;
export type DebugBreakpointRemoveResult=z.infer<typeof DebugBreakpointRemoveResultSchema>;
export type DebugBreakpointListResult=z.infer<typeof DebugBreakpointListResultSchema>;
export type DebugStackFrame=z.infer<typeof DebugStackFrameSchema>;
export type DebugStackResult=z.infer<typeof DebugStackResultSchema>;
export type DebugVariable=z.infer<typeof DebugVariableSchema>;
export type DebugScope=z.infer<typeof DebugScopeSchema>;
export type DebugVariablesResult=z.infer<typeof DebugVariablesResultSchema>;
export type DebugExpandResult=z.infer<typeof DebugExpandResultSchema>;
export type DebugControlAction=z.infer<typeof DebugControlActionSchema>;
export type DebugControlResult=z.infer<typeof DebugControlResultSchema>;
export type DebuggerBreakpointSnapshot=z.infer<typeof DebuggerBreakpointSnapshotSchema>;
export type DebuggerBreakpointApplyResult=z.infer<typeof DebuggerBreakpointApplyResultSchema>;
export type DebuggerBreakpointRemoveBridgeResult=z.infer<typeof DebuggerBreakpointRemoveBridgeResultSchema>;
export type DebuggerInfoResult=z.infer<typeof DebuggerInfoResultSchema>;
