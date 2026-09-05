import {
  WorkflowActiveSceneSchema,WorkflowDiffParamsSchema,WorkflowDiffResultSchema,WorkflowSnapshotParamsSchema,
  type DiagnosticPage,type RuntimeStatus,type ScreenshotRecord,type WorkflowDiffParams,type WorkflowDiffResult,type WorkflowSnapshotParams
} from '@godot-mcp/protocol';
import type {RpcRouter} from '../bridge/rpc-router.js';
import type {RuntimeService} from '../runtime/runtime-service.js';
import type {SessionStore} from '../session/session-store.js';
import type {Session} from '../session/session.js';
import type {VisualTools} from '../tools/visual-tools.js';
import {WorkflowStore} from './workflow-store.js';

interface WorkflowBridge {connected:boolean;rpc:Pick<RpcRouter,'call'>;}
type RuntimeView=Pick<RuntimeService,'status'|'tailDiagnostics'|'query'>;
type VisualView=Pick<VisualTools,'capture'>;

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
  private async diagnosticSnapshot(limit:number){
    const page=await this.runtime.tailDiagnostics(limit);
    if(!page)return null;
    return {runId:page.runId,cursor:page.nextCursor,entries:page.entries,dropped:page.dropped,truncated:page.truncated};
  }
  private async capture(params:WorkflowSnapshotParams):Promise<{screenshot:ScreenshotRecord;imageData:string}|null>{
    if(params.capture==='none')return null;
    const metadata={label:params.label,reason:'manual_request' as const,checkpoint:params.checkpoint};
    const captured=params.capture==='editor_3d'
      ? await this.visual.capture('editor_3d',{...metadata,viewport_index:params.viewport_index})
      : await this.visual.capture(params.capture,{...metadata});
    return {screenshot:captured.result.screenshot,imageData:captured.data};
  }
  async snapshot(input:WorkflowSnapshotParams|unknown):Promise<{snapshot:Awaited<ReturnType<WorkflowStore['save']>>;imageData?:string}>{
    const params=WorkflowSnapshotParamsSchema.parse(input);
    const runtime=await this.runtime.status();
    const activeScene=await this.activeScene();
    const diagnostics=await this.diagnosticSnapshot(params.diagnostic_limit);
    const captured=await this.capture(params);
    const manifest=await this.sessions.read(this.session.id);
    const snapshot=await this.store.save({label:params.label,activeScene,runtime,diagnostics,
      screenshot:captured?.screenshot??null,cursors:{nextScreenshotSequence:manifest.nextScreenshotSequence,
        errors:manifest.errors.length,transactions:manifest.transactions.length,checkpoints:manifest.checkpoints.length,
        runtimeRuns:manifest.runtimeRuns.length}});
    return {snapshot,...(captured?{imageData:captured.imageData}:{})};
  }
  private async diagnosticDelta(baseline:Awaited<ReturnType<WorkflowStore['load']>>,current:RuntimeStatus,limit:number):Promise<{
    runId:string|null;entries:DiagnosticPage['entries'];nextCursor:number;dropped:number;truncated:boolean;runChanged:boolean;
  }>{
    const runChanged=baseline.runtime.runId!==current.runId;
    if(!current.runId||!current.features.diagnostics)return {runId:current.runId,entries:[],nextCursor:0,dropped:0,truncated:false,runChanged};
    if(!runChanged&&baseline.diagnostics?.runId===current.runId){
      const page=await this.runtime.query('all',{run_id:current.runId,after:baseline.diagnostics.cursor,limit});
      return {runId:current.runId,entries:page.entries,nextCursor:page.nextCursor,dropped:page.dropped,truncated:page.truncated,runChanged};
    }
    const page=await this.runtime.tailDiagnostics(limit);
    return page?{runId:current.runId,entries:page.entries,nextCursor:page.nextCursor,dropped:page.dropped,truncated:page.truncated,runChanged}
      :{runId:current.runId,entries:[],nextCursor:0,dropped:0,truncated:false,runChanged};
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
