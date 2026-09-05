import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,it} from 'vitest';
import {runtimeHarness,waitFor} from './helpers/runtime-harness.js';

function imageContent(result:any){return result.content.find((entry:any)=>entry.type==='image');}

it('runs, sees, persists a baseline, and diffs a second owned run through one workflow primitive',async()=>{
  const h=await runtimeHarness({noRuntimeError:true});
  try{
    const first=await h.client.callTool({name:'workflow.run_check',arguments:{target:'current',capture:true,settle_ms:500,label:'workflow_pass_1'}});
    expect(first.isError,JSON.stringify(first.structuredContent)).not.toBe(true);
    const firstValue=first.structuredContent as any;
    expect(firstValue.verdict).toBe('pass');
    expect(firstValue.runtime).toMatchObject({state:'running',ownership:'session',connected:true});
    expect(firstValue.diagnostics.entries.some((entry:any)=>entry.kind==='warning')).toBe(true);
    expect(firstValue.diagnostics.entries.some((entry:any)=>entry.kind==='error')).toBe(false);
    expect(firstValue.screenshot).toMatchObject({type:'game',runId:firstValue.runtime.runId});
    expect(imageContent(first)).toMatchObject({type:'image',mimeType:'image/png'});
    const manifest=(await h.client.callTool({name:'session.manifest',arguments:{}})).structuredContent?.manifest as any;
    const imagePath=path.join(h.root,'.godot-mcp','sessions',manifest.sessionId,firstValue.screenshot.path);
    expect((await readFile(imagePath)).length).toBeGreaterThan(65536);
    const workflowArtifact=path.join(h.root,'.godot-mcp','sessions',manifest.sessionId,'artifacts','workflow',`${firstValue.snapshot.id}.json`);
    expect(JSON.parse(await readFile(workflowArtifact,'utf8')).id).toBe(firstValue.snapshot.id);

    const second=await h.client.callTool({name:'workflow.run_check',arguments:{target:'current',capture:true,settle_ms:500,label:'workflow_pass_2'}});
    expect(second.isError,JSON.stringify(second.structuredContent)).not.toBe(true);
    expect((second.structuredContent as any).runtime.runId).not.toBe(firstValue.runtime.runId);

    const delta=await h.client.callTool({name:'workflow.diff_since',arguments:{snapshot_id:firstValue.snapshot.id}});
    expect(delta.isError,JSON.stringify(delta.structuredContent)).not.toBe(true);
    expect(delta.structuredContent).toMatchObject({runtime:{runChanged:true},diagnostics:{runChanged:true}});
    expect((delta.structuredContent as any).screenshots.length).toBeGreaterThanOrEqual(1);
    expect((delta.structuredContent as any).runtimeRuns.length).toBeGreaterThanOrEqual(1);
  }finally{await h.close();}
},60000);

it('returns fail with retained visual evidence when native runtime errors occur',async()=>{
  const h=await runtimeHarness();
  try{
    const checked=await h.client.callTool({name:'workflow.run_check',arguments:{target:'current',capture:true,settle_ms:500,label:'workflow_error'}});
    expect(checked.isError,JSON.stringify(checked.structuredContent)).not.toBe(true);
    const value=checked.structuredContent as any;
    expect(value.verdict).toBe('fail');
    expect(value.diagnostics.entries.some((entry:any)=>entry.kind==='error'&&entry.message.includes('RUNTIME_ERROR'))).toBe(true);
    expect(value.screenshot).toMatchObject({type:'game'});
    expect(imageContent(checked)).toMatchObject({type:'image',mimeType:'image/png'});
  }finally{await h.close();}
},30000);

it('never stops or replaces an external/manual runtime',async()=>{
  const h=await runtimeHarness({manual:true,noRuntimeError:true});
  try{
    await waitFor(async()=>(await h.client.callTool({name:'runtime.status',arguments:{}})).structuredContent?.ownership==='external');
    const checked=await h.client.callTool({name:'workflow.run_check',arguments:{target:'current',capture:false,settle_ms:0}});
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent).toMatchObject({error:{code:'RUNTIME_NOT_OWNED'}});
    expect((await h.client.callTool({name:'runtime.status',arguments:{}})).structuredContent).toMatchObject({ownership:'external'});
  }finally{await h.close();}
},30000);
