import {expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {NO_RUNTIME_FEATURES} from '@godot-mcp/protocol';
import {WorkflowService} from '../src/workflow/workflow-service.js';
import {createSession} from '../src/session/session.js';
import {SessionStore} from '../src/session/session-store.js';
import {BridgeRpcError} from '../src/bridge/rpc-router.js';

async function fixture(values:unknown[]){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-project-check-'));
  const session=createSession(root),sessions=new SessionStore(root);await sessions.create(session);
  const runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';let launched=false,index=0;
  const running={state:'running',runId,scenePath:'res://main.tscn',connected:true,ownership:'session',features:{...NO_RUNTIME_FEATURES,inspect:true,diagnostics:true},errorCode:null};
  const idle={...running,state:'stopped',runId:null,connected:false,ownership:'none',features:{...NO_RUNTIME_FEATURES}};
  const runtime:any={status:async()=>launched?running:idle,run:async()=>{launched=true;return running;},stop:async()=>{launched=false;return {stopped:true,runId};},
    request:async()=>({runId,property:'test_status',value:values[Math.min(index++,values.length-1)]}),
    tailDiagnostics:async()=>({runId,entries:[{sequence:1,runId,timestamp:new Date().toISOString(),kind:'output',stream:'stdout',message:'PROJECT FAIL is ordinary console output',file:null,line:null,frames:[],truncated:false}],nextCursor:1,oldestAvailable:1,dropped:0,truncated:false,errorCount:0,warningCount:0,outputCount:1}),query:async()=>({})};
  const workflow=new WorkflowService(session,sessions,{connected:true,rpc:{call:async()=>({path:'res://main.tscn',root_name:'Main',root_type:'Node2D'})}} as any,runtime,{capture:async()=>{throw new Error('capture not requested');}} as any);
  const args={capture:false,include_performance:false,settle_ms:0};
  const contract={node_path:'/root/Main/Probe',property:'test_status',timeout_ms:300};
  return {workflow,runtime,args,contract,sessions,session};
}

it('labels unconfigured project tests and visual review as not checked',async()=>{
  const h=await fixture([{type:'String',value:'fail'}]);
  const {result}=await h.workflow.runCheck(h.args);
  expect(result.verdict).toBe('pass');
  expect(result).toMatchObject({verdictScope:'runtime_health',checks:{projectTests:'not_checked',visualReview:'not_checked'}});
});

it('reports a configured project failure separately from a healthy runtime',async()=>{
  const h=await fixture([{type:'String',value:'fail'}]);
  const {result}=await h.workflow.runCheck({...h.args,project_test:h.contract});
  expect(result).toMatchObject({verdict:'fail',runtime:{state:'running',connected:true},checks:{runtime:'pass',engineDiagnostics:'pass',projectTests:'fail'}});
  expect(result.snapshot).toMatchObject({verification:{projectTests:'fail'}});
});

it('waits for an asynchronous project probe to pass',async()=>{
  const h=await fixture([{type:'String',value:'pending'},{type:'StringName',value:'pass'}]);
  const {result}=await h.workflow.runCheck({...h.args,project_test:h.contract});
  expect(result).toMatchObject({verdict:'pass',projectTest:{status:'pass',value:'pass',timedOut:false}});
});

it('keeps an unfinished project probe pending after its deadline',async()=>{
  const h=await fixture([{type:'String',value:'pending'}]);
  const {result}=await h.workflow.runCheck({...h.args,project_test:{...h.contract,timeout_ms:10}});
  expect(result).toMatchObject({verdict:'inconclusive',projectTest:{status:'pending',timedOut:true},checks:{projectTests:'pending'}});
});

it('reads a structured report property without console FAIL heuristics',async()=>{
  const h=await fixture([{type:'Dictionary',value:[{key:{type:'String',value:'status'},value:{type:'String',value:'pass'}}]}]);
  const {result}=await h.workflow.runCheck({...h.args,project_test:{...h.contract,property:'test_report',field_path:['status']}});
  expect(result).toMatchObject({verdict:'pass',projectTest:{status:'pass',value:'pass'}});
});

it('returns a failed workflow snapshot when the runtime never becomes ready',async()=>{
  const h=await fixture([]);
  h.runtime.run=async()=>{throw new BridgeRpcError('RUNTIME_START_TIMEOUT','Game did not become ready');};
  h.runtime.status=async()=>({state:'failed',runId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',scenePath:'res://main.tscn',connected:false,ownership:'session',features:{...NO_RUNTIME_FEATURES},errorCode:'RUNTIME_START_TIMEOUT'});
  const {result}=await h.workflow.runCheck(h.args);
  expect(result).toMatchObject({verdict:'fail',runtime:{state:'failed'},checks:{runtime:'fail',projectTests:'not_checked'}});
  expect(result.observationErrors).toContainEqual(expect.objectContaining({code:'RUNTIME_START_TIMEOUT'}));
});
