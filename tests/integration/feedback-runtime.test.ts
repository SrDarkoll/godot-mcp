import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,it} from 'vitest';
import {runtimeHarness} from './helpers/runtime-harness.js';

it.skipIf(!process.env.GODOT_BIN||process.env.GODOT_RUNTIME_INTEGRATION!=='1')('distinguishes live project-test failure and retains diagnostics for a scene that never starts',async()=>{
  const h=await runtimeHarness({noRuntimeError:true});
  try{
    const projectBefore=await readFile(path.join(h.root,'project.godot'));
    await writeFile(path.join(h.root,'feedback_probe.gd'),'extends Node\n@export var test_status: String = "pending"\nfunc _ready() -> void:\n    await get_tree().create_timer(0.2).timeout\n    test_status = "fail"\n    print("FEEDBACK_PROBE completed")\n');
    await writeFile(path.join(h.root,'feedback_probe.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://feedback_probe.gd" id="1"]\n[node name="FeedbackProbe" type="Node"]\nscript = ExtResource("1")\n');
    const checked=await h.client.callTool({name:'workflow.run_check',arguments:{target:'path',path:'res://feedback_probe.tscn',capture:false,settle_ms:0,include_performance:false,
      project_test:{node_path:'/root/FeedbackProbe',property:'test_status',timeout_ms:5000}}});
    expect(checked.isError,JSON.stringify(checked.structuredContent)).not.toBe(true);
    const result=checked.structuredContent as any;
    expect(result).toMatchObject({verdict:'fail',runtime:{state:'running',connected:true},projectTest:{status:'fail',value:'fail'},checks:{projectTests:'fail',visualReview:'not_checked'}});
    expect(result.runtime.startup).toMatchObject({phase:'ready',exitCode:null});
    expect((await readFile(result.runtime.startup.logPath,'utf8')).length).toBeGreaterThan(0);
    expect(await readFile(path.join(h.root,'project.godot'))).toEqual(projectBefore);

    await writeFile(path.join(h.root,'feedback_broken.gd'),'extends Node\n\nfunc broken() -> void:\n    var broken = [\n');
    await writeFile(path.join(h.root,'feedback_broken.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://feedback_broken.gd" id="1"]\n[node name="FeedbackBroken" type="Node"]\nscript = ExtResource("1")\n');
    const failed=await h.client.callTool({name:'workflow.run_check',arguments:{target:'path',path:'res://feedback_broken.tscn',capture:false,settle_ms:0,include_performance:false}});
    expect(failed.isError,JSON.stringify(failed.structuredContent)).not.toBe(true);
    const failure=failed.structuredContent as any;
    expect(failure).toMatchObject({verdict:'fail',runtime:{state:'failed',connected:false,startup:{phase:'scene_validation',processState:'not_started'}},checks:{projectTests:'not_checked'}});
    const errors=await h.client.callTool({name:'debug.errors',arguments:{run_id:failure.runtime.runId}});
    expect(errors.isError,JSON.stringify(errors.structuredContent)).not.toBe(true);
    expect((errors.structuredContent as any).entries).toContainEqual(expect.objectContaining({kind:'error',file:'res://feedback_broken.gd',line:4,source:'scene_validation'}));
    expect(await readFile(path.join(h.root,'project.godot'))).toEqual(projectBefore);

    await writeFile(path.join(h.root,'feedback_exit.gd'),'extends Node\nfunc _ready() -> void:\n    print("BOOT_EARLY_EXIT")\n    get_tree().quit(17)\n');
    await writeFile(path.join(h.root,'feedback_exit.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://feedback_exit.gd" id="1"]\n[node name="FeedbackExit" type="Node"]\nscript = ExtResource("1")\n');
    const exited=await h.client.callTool({name:'workflow.run_check',arguments:{target:'path',path:'res://feedback_exit.tscn',capture:false,settle_ms:0,include_performance:false}});
    expect(exited.isError,JSON.stringify(exited.structuredContent)).not.toBe(true);
    const early=exited.structuredContent as any;
    expect(early).toMatchObject({verdict:'fail',runtime:{state:'failed',connected:false,startup:{phase:'process_stopped',processState:'editor_stopped',exitCode:null}}});
    const output=await h.client.callTool({name:'debug.output',arguments:{run_id:early.runtime.runId}});
    expect(output.isError,JSON.stringify(output.structuredContent)).not.toBe(true);
    expect((output.structuredContent as any).entries).toContainEqual(expect.objectContaining({source:'startup_log',message:'BOOT_EARLY_EXIT'}));
    const delta=await h.client.callTool({name:'workflow.diff_since',arguments:{snapshot_id:failure.snapshot.id}});
    expect(delta.isError,JSON.stringify(delta.structuredContent)).not.toBe(true);
    expect((delta.structuredContent as any).diagnostics.entries).toContainEqual(expect.objectContaining({source:'startup_log',message:'BOOT_EARLY_EXIT'}));
    expect(await readFile(path.join(h.root,'project.godot'))).toEqual(projectBefore);
  }finally{await h.close();}
},120000);
