import {
  DebugBreakpointListSchema,DebugBreakpointRemoveSchema,DebugBreakpointSetSchema,
  DebugContinueSchema,DebugExpandSchema,DebugStackSchema,DebugStepIntoSchema,DebugStepOutSchema,DebugStepOverSchema,DebugVariablesSchema
} from '@godot-mcp/protocol';
import type {DebuggerService} from '../debugger/debugger-service.js';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import {
  continueDebugger,expandDebugVariable,getDebugStack,getDebugVariables,listDebugBreakpoints,
  removeDebugBreakpoint,setDebugBreakpoint,stepIntoDebugger,stepOutDebugger,stepOverDebugger
} from '../tools/advanced-debug-tools.js';
import {bindCanonicalTool,defineCanonicalToolBinding} from '../tooling/canonical-tool-binding.js';

const debugBreakpointSetTool=defineCanonicalToolBinding('debug.breakpoint.set',{inputSchema:DebugBreakpointSetSchema,handler:setDebugBreakpoint});
const debugBreakpointRemoveTool=defineCanonicalToolBinding('debug.breakpoint.remove',{inputSchema:DebugBreakpointRemoveSchema,handler:removeDebugBreakpoint});
const debugBreakpointListTool=defineCanonicalToolBinding('debug.breakpoint.list',{inputSchema:DebugBreakpointListSchema,handler:listDebugBreakpoints});
const debugStackTool=defineCanonicalToolBinding('debug.stack',{inputSchema:DebugStackSchema,handler:getDebugStack});
const debugVariablesTool=defineCanonicalToolBinding('debug.variables',{inputSchema:DebugVariablesSchema,handler:getDebugVariables});
const debugExpandTool=defineCanonicalToolBinding('debug.expand',{inputSchema:DebugExpandSchema,handler:expandDebugVariable});
const debugContinueTool=defineCanonicalToolBinding('debug.continue',{inputSchema:DebugContinueSchema,handler:continueDebugger});
const debugStepIntoTool=defineCanonicalToolBinding('debug.step_into',{inputSchema:DebugStepIntoSchema,handler:stepIntoDebugger});
const debugStepOverTool=defineCanonicalToolBinding('debug.step_over',{inputSchema:DebugStepOverSchema,handler:stepOverDebugger});
const debugStepOutTool=defineCanonicalToolBinding('debug.step_out',{inputSchema:DebugStepOutSchema,handler:stepOutDebugger});

export function registerDebuggerTools(registrar:ToolRegistrar,service:DebuggerService):void{
  bindCanonicalTool(registrar,debugBreakpointSetTool,service);
  bindCanonicalTool(registrar,debugBreakpointRemoveTool,service);
  bindCanonicalTool(registrar,debugBreakpointListTool,service);
  bindCanonicalTool(registrar,debugStackTool,service);
  bindCanonicalTool(registrar,debugVariablesTool,service);
  bindCanonicalTool(registrar,debugExpandTool,service);
  bindCanonicalTool(registrar,debugContinueTool,service);
  bindCanonicalTool(registrar,debugStepIntoTool,service);
  bindCanonicalTool(registrar,debugStepOverTool,service);
  bindCanonicalTool(registrar,debugStepOutTool,service);
}
