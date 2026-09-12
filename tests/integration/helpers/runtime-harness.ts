import {mkdir,mkdtemp,cp,writeFile,readFile} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
import {initProject} from '../../../packages/cli/src/init/init-project.js';
import {startClient,stopProcess,waitFor} from './visual-harness.js';
export {waitFor};
export async function runtimeHarness(options:{manual?:boolean;manualAfterStop?:boolean;breakAfterReady?:boolean;slowCapture?:boolean}={}) {
  const manual=options.manual??false;
  const godot=process.env.GODOT_BIN;
  if(!godot || process.env.GODOT_RUNTIME_INTEGRATION!=='1')throw new Error('GODOT_BIN and GODOT_RUNTIME_INTEGRATION=1 required');
  const parent=path.resolve('.godot-mcp/runtime-test-runs');await mkdir(parent,{recursive:true});
  const root=await mkdtemp(path.join(parent,'runtime-'));
  await cp(path.resolve('fixtures/runtime-project'),root,{recursive:true});
  const generated=spawnSync(godot,['--headless','--path',root,'--script',path.resolve('tests/integration/helpers/generate_noise.gd')],{windowsHide:true,encoding:'utf8',timeout:15000});
  if(generated.status!==0)throw new Error(generated.stderr);
  await initProject({projectRoot:root,godotBin:godot,enable:true});
  const imported=spawnSync(godot,['--headless','--editor','--path',root,'--import'],{windowsHide:true,encoding:'utf8',timeout:20000});
  await writeFile(path.join(root,'import.log'),`${imported.stdout??''}${imported.stderr??''}`);
  if(imported.status!==0 || /SCRIPT ERROR|Parse Error/.test(imported.stderr??''))throw new Error(`Runtime fixture import failed: ${imported.stderr}`);
  if(options.breakAfterReady){
    const file=path.join(root,'main.gd');const source=await readFile(file,'utf8');
    await writeFile(file,source.replace('push_error("RUNTIME_ERROR")','push_error("RUNTIME_ERROR")\n    get_tree().create_timer(0.5).timeout.connect(func(): EngineDebugger.debug(true))'));
  }
  if(options.slowCapture){
    const file=path.join(root,'addons/godot_mcp/runtime/runtime_capture.gd');const source=await readFile(file,'utf8');
    await writeFile(file,source.replace('func _capture(agent: Node, packet: Dictionary) -> Dictionary:', 'func _capture(agent: Node, packet: Dictionary) -> Dictionary:\n    var marker := FileAccess.open("res://.godot-mcp/capture-started",FileAccess.WRITE)\n    marker.store_string("started")\n    marker.close()\n    await agent.get_tree().create_timer(5.0).timeout'));
  }
  if(manual||options.manualAfterStop){
    const plugin=path.join(root,'addons/godot_mcp/plugin.gd');
    let source=await readFile(plugin,'utf8');
    if(manual)source=source.replace('func _enter_tree() -> void:', 'func _enter_tree() -> void:\n    _test_manual_launch.call_deferred()');
    source+='\nfunc _test_manual_launch() -> void:\n    await get_tree().process_frame\n    EditorInterface.play_main_scene()\n\nfunc _process(_delta: float) -> void:\n    if FileAccess.file_exists("res://.godot-mcp/start-test-game"):\n        DirAccess.remove_absolute("res://.godot-mcp/start-test-game")\n        EditorInterface.play_main_scene()\n    if FileAccess.file_exists("res://.godot-mcp/stop-test-game"):\n        EditorInterface.stop_playing_scene()\n';
    await writeFile(plugin,source);
  }
  const client=await startClient(root);
  const child=spawn(godot,['--editor','--path',root,'res://main.tscn'],{windowsHide:true});let logs='';
  child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  await waitFor(async()=>(await client.callTool({name:'session.status',arguments:{}})).structuredContent?.editorConnected===true);
  await waitFor(async()=>!!(await client.callTool({name:'scene.get_tree',arguments:{}})).structuredContent?.root);
  return {root,client,godot,logs:()=>logs,close:async()=>{
    try {
      await client.callTool({name:'project.stop',arguments:{}}).catch(()=>{});
      if(manual||options.manualAfterStop){await writeFile(path.join(root,'.godot-mcp/stop-test-game'),'stop');await waitFor(async()=>{const r=await client.callTool({name:'runtime.status',arguments:{}});return r.structuredContent?.ownership==='none'||r.structuredContent?.state==='stopped';},5000);}
    } finally {try{await client.close();}finally{await stopProcess(child);await writeFile(path.join(root,'engine.log'),logs);}}
  }};
}
