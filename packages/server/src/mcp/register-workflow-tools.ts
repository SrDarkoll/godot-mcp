import {WorkflowDiffParamsSchema,WorkflowRunCheckParamsSchema,WorkflowSnapshotParamsSchema} from '@godot-mcp/protocol';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import type {WorkflowService} from '../workflow/workflow-service.js';
import {toolError,toolSuccess} from './tool-result.js';

function withOptionalImage<T extends object>(value:T,data?:string){
  const base=toolSuccess(value);
  return data?{...base,content:[...base.content,{type:'image' as const,mimeType:'image/png',data}]}:base;
}

export function registerWorkflowTools(registrar:ToolRegistrar,workflow:WorkflowService):void{
  registrar.registerTool('workflow.snapshot',{description:'Persist a deterministic baseline of editor/runtime/session state with an optional explicit visual capture.',inputSchema:WorkflowSnapshotParamsSchema},async args=>{
    try{const value=await workflow.snapshot(args);return withOptionalImage({snapshot:value.snapshot},value.imageData);}catch(error){return toolError(error);}
  });
  registrar.registerTool('workflow.run_check',{description:'Restart only a session-owned runtime, collect diagnostics/performance, optionally capture the game, and return a deterministic verification verdict.',inputSchema:WorkflowRunCheckParamsSchema},async args=>{
    try{const value=await workflow.runCheck(args);return withOptionalImage(value.result,value.imageData);}catch(error){return toolError(error);}
  });
  registrar.registerTool('workflow.diff_since',{description:'Compare current editor/runtime/session evidence with a persisted workflow snapshot without mutating the project.',inputSchema:WorkflowDiffParamsSchema},async args=>{
    try{return toolSuccess(await workflow.diffSince(args));}catch(error){return toolError(error);}
  });
}
