import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const godot=process.env.GODOT_BIN;
if(!godot)throw new Error('GODOT_BIN required');
const parent=path.resolve('.godot-mcp/runtime-test-runs');await mkdir(parent,{recursive:true});
const root=await mkdtemp(path.join(parent,'probe-'));await mkdir(path.join(root,'addons/probe'),{recursive:true});
const files={
 'project.godot':`config_version=5
[application]
config/name="Runtime probe"
run/main_scene="res://main.tscn"
[autoload]
Agent="*res://agent.gd"
[editor_plugins]
enabled=PackedStringArray("res://addons/probe/plugin.cfg")
[rendering]
renderer/rendering_method="gl_compatibility"
`,
 'main.tscn':'[gd_scene format=3]\n[node name="Main" type="Node2D"]\n',
 'addons/probe/plugin.cfg':'[plugin]\nname="Probe"\ndescription="Native debugger probe"\nauthor="Test"\nversion="1"\nscript="plugin.gd"\n',
 'logger.gd':`extends Logger
var mutex := Mutex.new()
var counts := {"output":0,"warning":0,"error":0}
func _log_message(_message: String, _error: bool) -> void:
    mutex.lock()
    counts.output += 1
    mutex.unlock()
func _log_error(_function: String, _file: String, _line: int, _code: String, _rationale: String, _notify: bool, error_type: int, _traces: Array[ScriptBacktrace]) -> void:
    mutex.lock()
    counts["warning" if error_type == 1 else "error"] += 1
    mutex.unlock()
func snapshot() -> Dictionary:
    mutex.lock()
    var result := counts.duplicate()
    mutex.unlock()
    return result
`,
 'agent.gd':`extends Node
var logger
func _ready() -> void:
    if not EngineDebugger.is_active():
        return
    logger = preload("res://logger.gd").new()
    OS.add_logger(logger)
    EngineDebugger.register_message_capture("godot_mcp", _capture)
    EngineDebugger.send_message("godot_mcp:hello", [])
func _capture(message: String, data: Array) -> bool:
    if message != "ping":
        return false
    print("PROBE_OUTPUT")
    push_warning("PROBE_WARNING")
    push_error("PROBE_ERROR")
    var thread := Thread.new()
    thread.start(func(): print("PROBE_THREAD"))
    thread.wait_to_finish()
    EngineDebugger.send_message("godot_mcp:pong", [data[0], logger.snapshot()])
    return true
func _exit_tree() -> void:
    if logger != null:
        OS.remove_logger(logger)
`,
 'addons/probe/plugin.gd':`@tool
extends EditorPlugin
class ProbeDebugger:
    extends EditorDebuggerPlugin
    signal received(result: Dictionary)
    func _has_capture(prefix: String) -> bool:
        return prefix == "godot_mcp"
    func _capture(message: String, data: Array, session_id: int) -> bool:
        if message == "godot_mcp:hello":
            get_session(session_id).send_message("godot_mcp:ping", ["x".repeat(65536)])
            return true
        if message == "godot_mcp:pong":
            received.emit({"sessionId":session_id,"length":str(data[0]).length(),"counts":data[1]})
            return true
        return false
var debugger := ProbeDebugger.new()
func _enter_tree() -> void:
    add_debugger_plugin(debugger)
    debugger.received.connect(_received)
    _launch.call_deferred()
func _launch() -> void:
    await get_tree().process_frame
    EditorInterface.play_main_scene()
func _received(result: Dictionary) -> void:
    _finish.call_deferred(result)
func _finish(result: Dictionary) -> void:
    var session = debugger.get_session(result.sessionId)
    EditorInterface.stop_playing_scene()
    if session.is_active():
        await session.stopped
    result["stopped"] = not session.is_active()
    var file := FileAccess.open("res://probe-result.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(result))
    file.close()
    get_tree().quit()
func _exit_tree() -> void:
    EditorInterface.stop_playing_scene()
    remove_debugger_plugin(debugger)
`
};
for(const [file,content] of Object.entries(files))await writeFile(path.join(root,file),content);
const child=spawn(godot,['--editor','--path',root],{windowsHide:true});let output='';
child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
const timer=setTimeout(()=>child.kill(),35000);
const code=await new Promise(resolve=>child.once('exit',resolve));clearTimeout(timer);
await writeFile(path.join(root,'probe-output.log'),output);
const result=JSON.parse(await readFile(path.join(root,'probe-result.json'),'utf8'));
if(code!==0 || result.length!==65536 || !result.stopped || result.counts.output<2 || result.counts.warning<1 || result.counts.error<1)throw new Error(JSON.stringify(result));
console.info(JSON.stringify({root,...result}));
