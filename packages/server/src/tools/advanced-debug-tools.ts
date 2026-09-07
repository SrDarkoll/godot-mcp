import type {
  DebugBreakpointListParams,DebugBreakpointRemoveParams,DebugBreakpointSetParams,
  DebugContinueParams,DebugExpandParams,DebugStackParams,DebugStepIntoParams,DebugStepOutParams,DebugStepOverParams,DebugVariablesParams
} from '@godot-mcp/protocol';
import type {DebuggerService} from '../debugger/debugger-service.js';

export const setDebugBreakpoint=(service:DebuggerService,args:DebugBreakpointSetParams)=>service.setBreakpoint(args);
export const removeDebugBreakpoint=(service:DebuggerService,args:DebugBreakpointRemoveParams)=>service.removeBreakpoint(args);
export const listDebugBreakpoints=(service:DebuggerService,_args:DebugBreakpointListParams)=>service.listBreakpoints();
export const getDebugStack=(service:DebuggerService,_args:DebugStackParams)=>service.stack();
export const getDebugVariables=(service:DebuggerService,args:DebugVariablesParams)=>service.variables(args);
export const expandDebugVariable=(service:DebuggerService,args:DebugExpandParams)=>service.expand(args);
export const continueDebugger=(service:DebuggerService,_args:DebugContinueParams)=>service.continueExecution();
export const stepIntoDebugger=(service:DebuggerService,_args:DebugStepIntoParams)=>service.stepInto();
export const stepOverDebugger=(service:DebuggerService,_args:DebugStepOverParams)=>service.stepOver();
export const stepOutDebugger=(service:DebuggerService,_args:DebugStepOutParams)=>service.stepOut();
