import {
  WorkflowActiveSceneSchema,
  WorkflowDiffParamsSchema,
  WorkflowDiffResultSchema,
  WorkflowRunCheckParamsSchema,
  WorkflowRunCheckResultSchema,
  WorkflowSnapshotParamsSchema,
  type DiagnosticPage,
  type RunTarget,
  type RuntimeStatus,
  type ScreenshotRecord,
  type WorkflowActiveScene,
  type WorkflowDiffParams,
  type WorkflowDiffResult,
  type WorkflowDiagnosticSnapshot,
  type WorkflowRunCheckParams,
  type WorkflowRunCheckResult,
  type WorkflowSnapshot,
  type WorkflowSnapshotParams
} from '@godot-mcp/protocol';
import {BridgeRpcError,type RpcRouter} from '../bridge/rpc-router.js';
import type {RuntimeService} from '../runtime/runtime-service.js';
import type {SessionStore} from '../session/session-store.js';
import type {Session} from '../session/session.js';
import type {VisualTools} from '../tools/visual-tools.js';
import {WorkflowStore} from './workflow-store.js';
import {pollProjectTest,uncheckedProjectTest} from './project-test.js';
import type {WorkflowProjectTestResult,WorkflowVerification} from '@godot-mcp/protocol';

interface WorkflowBridge {connected:boolean;rpc:Pick<RpcRouter,'call'>;}
type RuntimeView=Pick<RuntimeService,'status'|'tailDiagnostics'|'query'|'run'|'stop'|'request'>;
type VisualView=Pick<VisualTools,'capture'>;
interface CapturedWorkflowImage {screenshot:ScreenshotRecord;imageData:string;}
const ACTIVE_STATES=new Set<RuntimeStatus['state']>(['starting','running','paused','breaked','stopping']);
const SOFT_OBSERVATION_CODES=new Set(['CAPABILITY_UNAVAILABLE','CAPTURE_UNSUPPORTED','CAPTURE_FAILED','RUNTIME_CAPTURE_TIMEOUT']);

export class WorkflowService {
  private readonly store:WorkflowStore;
  constructor(private readonly session:Session,private readonly sessions:SessionStore,private readonly bridge:WorkflowBridge,
    private readonly runtime:RuntimeView,private readonly visual:VisualView,store?:WorkflowStore){
    this.store=store??new WorkflowStore(session,sessions);
  }

  private async activeScene(){
    if(!this.bridge.connected)return null;
    return WorkflowActiveSceneSchema.parse(await this.bridge.rpc.call('editor.get_active_scene',{}));
  }

  private async diagnosticSnapshot(limit:number):Promise<WorkflowDiagnosticSnapshot|null>{
    const page=await this.runtime.tailDiagnostics(limit);
    if(!page)return null;
    return {runId:page.runId,cursor:page.nextCursor,entries:page.entries,dropped:page.dropped,truncated:page.truncated,
      errorCount:page.errorCount,warningCount:page.warningCount,outputCount:page.outputCount};
  }

  private async capture(mode:Exclude<WorkflowSnapshotParams['capture'],'none'>,label:string,checkpoint:boolean,viewportIndex:number,
    reason:'manual_request'|'after_visual_change'):Promise<CapturedWorkflowImage>{
    const metadata={label,reason,checkpoint};
    const captured=mode==='editor_3d'
      ? await this.visual.capture('editor_3d',{...metadata,viewport_index:viewportIndex})
      : await this.visual.capture(mode,metadata);
    return {screenshot:captured.result.screenshot,imageData:captured.data};
  }

  private async persistSnapshot(label:string,runtime:RuntimeStatus,activeScene:WorkflowActiveScene|null,
    diagnostics:WorkflowDiagnosticSnapshot|null,captured:CapturedWorkflowImage|null,verification?:WorkflowVerification,projectTest?:WorkflowProjectTestResult):Promise<WorkflowSnapshot>{
    const manifest=await this.sessions.read(this.session.id);
    return this.store.save({label,activeScene,runtime,diagnostics,screenshot:captured?.screenshot??null,
      ...(verification?{verification}:{}),...(projectTest?{projectTest}:{}),cursors:{nextScreenshotSequence:manifest.nextScreenshotSequence,errors:manifest.errors.length,
        transactions:manifest.transactions.length,checkpoints:manifest.checkpoints.length,runtimeRuns:manifest.runtimeRuns.length}});
  }

  async snapshot(input:WorkflowSnapshotParams|unknown):Promise<{snapshot:WorkflowSnapshot;imageData?:string}>{
    const params=WorkflowSnapshotParamsSchema.parse(input);
    const runtime=await this.runtime.status();
    const activeScene=await this.activeScene();
    const diagnostics=await this.diagnosticSnapshot(params.diagnostic_limit);
    const captured=params.capture==='none'?null:await this.capture(params.capture,params.label,params.checkpoint,params.viewport_index,'manual_request');
    const snapshot=await this.persistSnapshot(params.label,runtime,activeScene,diagnostics,captured);
    return {snapshot,...(captured?{imageData:captured.imageData}:{})};
  }

  private observationError(error:unknown):{code:string;message:string}{
    if(error instanceof BridgeRpcError&&SOFT_OBSERVATION_CODES.has(error.code))return {code:error.code,message:error.message.slice(0,512)};
    throw error;
  }

  async runCheck(input:WorkflowRunCheckParams|unknown):Promise<{result:WorkflowRunCheckResult;imageData?:string}>{
    const params=WorkflowRunCheckParamsSchema.parse(input);
    const before=await this.runtime.status();
    if(ACTIVE_STATES.has(before.state)&&before.ownership==='external'){
      throw new BridgeRpcError('RUNTIME_NOT_OWNED','An external/manual Godot runtime is active and will not be replaced');
    }
    if(ACTIVE_STATES.has(before.state)&&before.ownership==='session')await this.runtime.stop();
    const target:RunTarget=params.target==='path'?{target:'path',path:params.path!}:{target:params.target};
    const observationErrors:{code:string;message:string}[]=[];
    let launchFailed=false;
    try{await this.runtime.run(target);}catch(error){
      if(!(error instanceof BridgeRpcError)||!['RUNTIME_START_TIMEOUT','RUNTIME_START_FAILED'].includes(error.code))throw error;
      launchFailed=true;observationErrors.push({code:error.code,message:error.message.slice(0,512)});
    }
    if(!launchFailed&&params.settle_ms>0)await new Promise(resolve=>setTimeout(resolve,params.settle_ms));
    let runtime=await this.runtime.status();
    const projectTest=params.project_test&&!launchFailed&&runtime.connected?await pollProjectTest(this.runtime,params.project_test):uncheckedProjectTest();
    if(params.project_test&&(launchFailed||!runtime.connected))projectTest.status='unavailable';
    runtime=await this.runtime.status();
    const diagnostics=await this.diagnosticSnapshot(params.diagnostic_limit);
    let performance:Record<string,unknown>|null=null;
    let captured:CapturedWorkflowImage|null=null;

    if(!launchFailed&&params.include_performance&&runtime.features.performance&&runtime.state!=='breaked'){
      try{
        const sampled=await this.runtime.request('debug.performance');
        performance=sampled&&typeof sampled==='object'&&!Array.isArray(sampled)?sampled as Record<string,unknown>:null;
      }catch(error){observationErrors.push(this.observationError(error));}
    }
    if(params.capture&&!launchFailed){
      if(runtime.state==='breaked'){
        observationErrors.push({code:'RUNTIME_BREAKED',message:'Game capture is unavailable while the debugger is breaked'});
      }else if(!runtime.features.gameCapture){
        observationErrors.push({code:'CAPABILITY_UNAVAILABLE',message:'Game capture is unavailable for this runtime'});
      }else{
        try{captured=await this.capture('game',params.label,params.checkpoint,0,'after_visual_change');}
        catch(error){observationErrors.push(this.observationError(error));}
      }
    }

    const activeScene=await this.activeScene();
    const nativeError=(diagnostics?.errorCount??0)>0;
    const checks:WorkflowVerification={runtime:['running','paused'].includes(runtime.state)&&runtime.connected?'pass':['failed','stopped','disconnected'].includes(runtime.state)?'fail':'inconclusive',
      engineDiagnostics:nativeError?'fail':diagnostics&&runtime.features.diagnostics?'pass':'unavailable',projectTests:projectTest.status,visualReview:'not_checked'};
    const snapshot=await this.persistSnapshot(params.label,runtime,activeScene,diagnostics,captured,checks,projectTest);
    let verdict:WorkflowRunCheckResult['verdict']='inconclusive';
    if(nativeError||['failed','stopped','disconnected'].includes(runtime.state))verdict='fail';
    else if(runtime.state==='breaked'||observationErrors.length>0)verdict='inconclusive';
    else if(runtime.state==='running'||runtime.state==='paused')verdict='pass';
    if(projectTest.status==='fail')verdict='fail';
    else if(params.project_test&&projectTest.status!=='pass'&&verdict!=='fail')verdict='inconclusive';

    const result=WorkflowRunCheckResultSchema.parse({verdict,snapshot,runtime,diagnostics,performance,
      observationErrors,screenshot:captured?.screenshot??null,verdictScope:params.project_test?'configured_project_test':'runtime_health',checks,projectTest});
    return {result,...(captured?{imageData:captured.imageData}:{})};
  }

  private async diagnosticDelta(baseline:WorkflowSnapshot,current:RuntimeStatus,limit:number):Promise<{
    runId:string|null;entries:DiagnosticPage['entries'];nextCursor:number;dropped:number;truncated:boolean;runChanged:boolean;
    errorCount:number;warningCount:number;outputCount:number;
  }>{
    const runChanged=baseline.runtime.runId!==current.runId;
    const empty={runId:current.runId,entries:[] as DiagnosticPage['entries'],nextCursor:0,dropped:0,truncated:false,runChanged,errorCount:0,warningCount:0,outputCount:0};
    if(!current.runId)return empty;
    if(!runChanged&&baseline.diagnostics?.runId===current.runId){
      const [page,tail]=await Promise.all([this.runtime.query('all',{run_id:current.runId,after:baseline.diagnostics.cursor,limit}),this.runtime.tailDiagnostics(1)]);
      return {runId:current.runId,entries:page.entries,nextCursor:page.nextCursor,dropped:page.dropped,truncated:page.truncated,runChanged,
        errorCount:tail?.errorCount??0,warningCount:tail?.warningCount??0,outputCount:tail?.outputCount??0};
    }
    const page=await this.runtime.tailDiagnostics(limit);
    return page?{runId:current.runId,entries:page.entries,nextCursor:page.nextCursor,dropped:page.dropped,truncated:page.truncated,runChanged,
      errorCount:page.errorCount,warningCount:page.warningCount,outputCount:page.outputCount}:empty;
  }

  async diffSince(input:WorkflowDiffParams|unknown):Promise<WorkflowDiffResult>{
    const params=WorkflowDiffParamsSchema.parse(input);const baseline=await this.store.load(params.snapshot_id);
    const [runtime,activeScene,manifest]=await Promise.all([this.runtime.status(),this.activeScene(),this.sessions.read(this.session.id)]);
    const diagnostics=await this.diagnosticDelta(baseline,runtime,params.diagnostic_limit);
    return WorkflowDiffResultSchema.parse({baseline:{id:baseline.id,createdAt:baseline.createdAt},
      activeScene:{before:baseline.activeScene,after:activeScene,changed:JSON.stringify(baseline.activeScene)!==JSON.stringify(activeScene)},
      runtime:{before:baseline.runtime,after:runtime,runChanged:baseline.runtime.runId!==runtime.runId,stateChanged:baseline.runtime.state!==runtime.state},
      diagnostics,screenshots:manifest.screenshots.filter(s=>s.sequence>=baseline.cursors.nextScreenshotSequence),
      errors:manifest.errors.slice(baseline.cursors.errors),transactions:manifest.transactions.slice(baseline.cursors.transactions),
      checkpoints:manifest.checkpoints.slice(baseline.cursors.checkpoints),runtimeRuns:manifest.runtimeRuns.slice(baseline.cursors.runtimeRuns)});
  }
}
