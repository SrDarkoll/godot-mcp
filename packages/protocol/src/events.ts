import * as z from 'zod/v4';
import {RuntimeStatusSchema} from './runtime.js';
import {DiagnosticBatchSchema} from './diagnostics.js';
import {DebuggerBreakpointSnapshotSchema} from './debugger.js';
const envelope={type:z.literal('event'),protocol:z.literal(1),sessionId:z.string().min(1),sequence:z.number().int().positive()};
export const BridgeRuntimeEventSchema=z.discriminatedUnion('event',[
  z.strictObject({...envelope,event:z.literal('runtime.state'),data:RuntimeStatusSchema}),
  z.strictObject({...envelope,event:z.literal('runtime.diagnostics'),data:DiagnosticBatchSchema}),
  z.strictObject({...envelope,event:z.literal('debugger.breakpoints'),data:DebuggerBreakpointSnapshotSchema})
]);
export type BridgeRuntimeEvent=z.infer<typeof BridgeRuntimeEventSchema>;
