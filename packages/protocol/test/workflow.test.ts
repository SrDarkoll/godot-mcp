import {describe,expect,it} from 'vitest';
import {
  WorkflowDiffParamsSchema,
  WorkflowRunCheckParamsSchema,
  WorkflowSnapshotParamsSchema,
  WorkflowSnapshotSchema
} from '../src/index.js';

describe('workflow protocol',()=>{
  it('applies bounded deterministic defaults',()=>{
    expect(WorkflowSnapshotParamsSchema.parse({})).toEqual({
      label:'workflow_snapshot',capture:'none',viewport_index:0,checkpoint:true,diagnostic_limit:100
    });
    expect(WorkflowRunCheckParamsSchema.parse({})).toEqual({
      target:'current',label:'run_check',capture:true,checkpoint:true,settle_ms:500,
      diagnostic_limit:100,include_performance:true
    });
  });

  it('requires a path only for path-targeted checks and validates diff ids',()=>{
    expect(()=>WorkflowRunCheckParamsSchema.parse({target:'path'})).toThrow();
    expect(WorkflowRunCheckParamsSchema.parse({target:'path',path:'res://levels/test.tscn'}).path).toBe('res://levels/test.tscn');
    expect(()=>WorkflowDiffParamsSchema.parse({snapshot_id:'../outside'})).toThrow();
  });

  it('validates compact persistent snapshots',()=>{
    const value={
      id:'123e4567-e89b-42d3-a456-426614174000',sessionId:'2026-09-05T22-00-00-000Z_1234abcd',label:'baseline',
      createdAt:'2026-09-05T22:00:00.000Z',activeScene:null,
      runtime:{state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:{inspect:false,scenePause:false,gameCapture:false,diagnostics:false,performance:false},errorCode:null},
      diagnostics:null,screenshot:null,
      cursors:{nextScreenshotSequence:1,errors:0,transactions:0,checkpoints:0,runtimeRuns:0}
    };
    expect(WorkflowSnapshotSchema.parse(value)).toEqual(value);
  });
});
