import {expect,it} from 'vitest';
import {registerWorkflowTools} from '../src/mcp/register-workflow-tools.js';

it('returns a workflow screenshot as MCP image content',async()=>{
  const handlers=new Map<string,(args:any)=>Promise<any>>();
  const registrar={registerTool:(name:string,_config:any,handler:any)=>{handlers.set(name,handler);}} as any;
  const workflow={
    snapshot:async()=>({snapshot:{id:'x'}}),diffSince:async()=>({baseline:{id:'x'}}),
    runCheck:async()=>({result:{verdict:'pass',snapshot:{id:'x'},runtime:{},diagnostics:null,performance:null,observationErrors:[],screenshot:{id:'shot'}},imageData:'ZmFrZXBuZw=='})
  } as any;
  registerWorkflowTools(registrar,workflow);
  const result=await handlers.get('workflow.run_check')!({capture:true});
  expect(result.structuredContent).toMatchObject({verdict:'pass'});
  expect(result.content).toContainEqual(expect.objectContaining({type:'image',mimeType:'image/png',data:'ZmFrZXBuZw=='}));
});
