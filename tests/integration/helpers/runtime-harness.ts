import {mkdir,mkdtemp,cp,writeFile,readFile} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import path from 'node:path';
import {initProject} from '../../../packages/cli/src/init/init-project.js';
import {startClient,stopProcess,waitFor} from './visual-harness.js';
export {waitFor};

async function allocateLoopbackPort(excluded:number|null=null):Promise<number>{
  for(let attempt=0;attempt<10;attempt++){
    const server=createServer();
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:0,exclusive:true},resolve);});
    const address=server.address();
    const port=typeof address==='object'&&address?address.port:0;
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    if(port>=1024&&port<=65535&&port!==excluded)return port;
  }
  throw new Error('Unable to allocate distinct loopback debugger ports');
}

export async function runtimeHarness(options:{manual?:boolean;manualAfterStop?:boolean;breakAfterReady?:boolean;slowCapture?:boolean;noRuntimeError?:boolean;manualBreakpoint?:boolean}={}) {
  const manual=options.manual??false;
  if(options.manualBreakpoint&&(manual||options.manualAfterStop))throw new Error('manualBreakpoint fixture cannot be combined with manual runtime launch fixtures');
  const godot=process.env.GODOT_BIN;
  if(!godot || process.env.GODOT_RUNTIME_INTEGRATION!=='1')throw new Error('GODOT_BIN and GODOT_RUNTIME_INTEGRATION=1 required');
  const parent=path.resolve('.godot-mcp/runtime-test-runs');await mkdir(parent,{recursive:true});
  const root=await mkdtemp(path.join(parent,'runtime-'));
  await cp(path.resolve('fixtures/runtime-project'),root,{recursive:true});
  const generated=spawnSync(godot,['--headless','--path',root,'--script',path.resolve('tests/integration/helpers/generate_noise.gd')],{windowsHide:true,encoding:'utf8',timeout:15000});
  if(generated.status!==0)throw new Error(generated.stderr);
  await initProject({projectRoot:root,godotBin:godot,enable:true});
  await mkdir(path.join(root,'.godot-mcp'),{recursive:true});
  const imported=spawnSync(godot,['--headless','--editor','--path',root,'--import'],{windowsHide:true,encoding:'utf8',timeout:20000});
  await writeFile(path.join(root,'import.log'),`${imported.stdout??''}${imported.stderr??''}`);
  if(imported.status!==0 || /SCRIPT ERROR|Parse Error/.test(imported.stderr??''))throw new Error(`Runtime fixture import failed: ${imported.stderr}`);
  if(options.noRuntimeError){
    const file=path.join(root,'main.gd');const source=await readFile(file,'utf8');
    await writeFile(file,source.replace('push_error("RUNTIME_ERROR")','print("RUNTIME_ERROR_SUPPRESSED")'));
  }
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
  if(options.manualBreakpoint){
    const plugin=path.join(root,'addons/godot_mcp/plugin.gd');let source=await readFile(plugin,'utf8');
    source+=`

func _process(_delta: float) -> void:
    if _debugger == null:
        return

    var manual_marker := "res://.godot-mcp/manual-breakpoint.json"
    if FileAccess.file_exists(manual_marker):
        var file := FileAccess.open(manual_marker, FileAccess.READ)
        var payload = JSON.parse_string(file.get_as_text()) if file != null else null
        # Windows does not allow deleting this marker while FileAccess still
        # owns the handle. Close it before remove or this branch repeats every
        # frame and starves the dump-breakpoints marker below.
        if file != null:
            file.close()
        DirAccess.remove_absolute(ProjectSettings.globalize_path(manual_marker))
        if typeof(payload) == TYPE_DICTIONARY:
            var breakpoint_path := str(payload.get("script_path", ""))
            var line := int(payload.get("line", 0))
            var enabled := bool(payload.get("enabled", true))
            _test_set_manual_breakpoint.call_deferred(breakpoint_path, line, enabled)
            return

    var dump_marker := "res://.godot-mcp/dump-breakpoints"
    if FileAccess.file_exists(dump_marker):
        DirAccess.remove_absolute(ProjectSettings.globalize_path(dump_marker))
        var out := FileAccess.open("res://.godot-mcp/breakpoints.json", FileAccess.WRITE)
        if out != null:
            out.store_string(JSON.stringify(EditorInterface.get_script_editor().get_breakpoints()))

func _write_manual_breakpoint_state(state: Dictionary) -> void:
    var out := FileAccess.open("res://.godot-mcp/manual-breakpoint-state.json", FileAccess.WRITE)
    if out != null:
        out.store_string(JSON.stringify(state))

func _test_set_manual_breakpoint(breakpoint_path: String, line: int, enabled: bool) -> void:
    var state := {"path":breakpoint_path,"line":line,"enabled":enabled}
    var script = load(breakpoint_path)
    state["scriptLoaded"] = script != null
    if script == null or line < 1:
        _write_manual_breakpoint_state(state)
        return
    # EditorInterface.edit_script is 1-based and converts to the ScriptEditor
    # internal zero-based location itself.
    EditorInterface.edit_script(script, line, 1, false)
    var current = EditorInterface.get_script_editor().get_current_editor()
    state["currentClass"] = current.get_class() if current != null else null
    if current == null:
        _write_manual_breakpoint_state(state)
        return
    var code_editor = current.get_base_editor()
    state["baseClass"] = code_editor.get_class() if code_editor != null else null
    state["isCodeEdit"] = code_editor is CodeEdit
    if code_editor is CodeEdit:
        code_editor.set_line_as_breakpoint(line - 1, enabled)
        state["lineBreakpointed"] = code_editor.is_line_breakpointed(line - 1)
    state["inventory"] = EditorInterface.get_script_editor().get_breakpoints()
    _write_manual_breakpoint_state(state)
`;
    await writeFile(plugin,source);
  }
  const dapPort=await allocateLoopbackPort();const debugPort=await allocateLoopbackPort(dapPort);
  const client=await startClient(root);
  const debugServer=`tcp://127.0.0.1:${debugPort}`;
  const child=spawn(godot,[
    '--editor','--dap-port',String(dapPort),'--debug-server',debugServer,'--path',root,'res://main.tscn',
    '--',`--godot-mcp-dap-port=${dapPort}`,`--godot-mcp-debug-server=${debugServer}`
  ],{windowsHide:true});let logs='';
  child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  await waitFor(async()=>(await client.callTool({name:'session.status',arguments:{}})).structuredContent?.editorConnected===true);
  await waitFor(async()=>!!(await client.callTool({name:'scene.get_tree',arguments:{}})).structuredContent?.root);
  let clientClosed=false;let editorClosed=false;
  const closeClient=async()=>{if(clientClosed)return;clientClosed=true;await client.close().catch(()=>{});};
  const closeEditor=async()=>{if(editorClosed)return;editorClosed=true;await stopProcess(child);await writeFile(path.join(root,'engine.log'),logs);};
  return {root,client,godot,dapPort,debugPort,logs:()=>logs,closeClient,closeEditor,close:async()=>{
    try {
      if(!clientClosed){
        await client.callTool({name:'project.stop',arguments:{}}).catch(()=>{});
        if(manual||options.manualAfterStop){await writeFile(path.join(root,'.godot-mcp/stop-test-game'),'stop');await waitFor(async()=>{const r=await client.callTool({name:'runtime.status',arguments:{}});return r.structuredContent?.ownership==='none'||r.structuredContent?.state==='stopped';},5000);}
      }
    } finally {await closeClient();await closeEditor();}
  }};
}
