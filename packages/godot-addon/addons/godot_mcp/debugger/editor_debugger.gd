@tool
extends EditorDebuggerPlugin
signal runtime_event(name: String, data: Dictionary)
var _editor
var _mcp_session := ""
var _owner_session := ""
var _run_id := ""
var _scene_path = null
var _state := "stopped"
var _debug_id := -1
var _features := {"inspect":false,"scenePause":false,"gameCapture":false,"diagnostics":false,"performance":false}
var _error_code = null
var _pending: Dictionary = {}
var _next_id := 0
var _launching := false
var _stopping := false
var _mcp_breakpoints: Dictionary = {}
var _mcp_breakpoint_session := ""
var _mcp_origin_depth := 0

func configure(editor_interface) -> void:
    _editor = editor_interface
func bind_session(session_id: String) -> void:
    if _mcp_session != session_id:
        _cancel_pending("RUNTIME_NOT_CONNECTED","MCP session changed")
    if not _mcp_breakpoint_session.is_empty() and _mcp_breakpoint_session != session_id:
        # A previous MCP process may have died before graceful cleanup. Forget
        # ownership proof, but never adopt or remove the physical editor entries.
        _mcp_breakpoints.clear()
    _mcp_breakpoint_session = session_id
    _mcp_session = session_id
    _publish()
    _publish_breakpoints()
func unbind_session() -> void:
    _mcp_session = ""
    _cancel_pending("EDITOR_NOT_CONNECTED","Editor bridge disconnected")
func _has_capture(prefix: String) -> bool:
    return prefix == "godot_mcp"
func _setup_session(session_id: int) -> void:
    var session = get_session(session_id)
    session.started.connect(_on_started.bind(session_id))
    session.stopped.connect(_on_stopped.bind(session_id))
    session.breaked.connect(_on_breaked.bind(session_id))
    session.continued.connect(_on_continued.bind(session_id))
    _mcp_origin_depth += 1
    for owned_breakpoint in _mcp_breakpoints.values():
        session.set_breakpoint(str(owned_breakpoint.scriptPath), int(owned_breakpoint.line), true)
    _mcp_origin_depth -= 1
func _active_sessions() -> Array:
    return get_sessions().filter(func(session): return session.is_active())
func _on_started(id: int) -> void:
    if not _launching or _state != "starting":
        # A later manually started game must not inherit the previous run's owner.
        _owner_session = ""
        _run_id = ""
        _debug_id = id
        _state = "running"
        _scene_path = null
    _publish()
func _on_stopped(id: int) -> void:
    if id == _debug_id:
        _state = "failed" if _state == "starting" else "stopped"
        _debug_id = -1
        _cancel_pending("RUNTIME_NOT_CONNECTED","Game stopped")
        _publish()
func _on_breaked(_can_debug: bool, id: int) -> void:
    if id == _debug_id:
        _state = "breaked"
        _cancel_pending("RUNTIME_BREAKED","Game interrupted in debugger")
        _publish()
func _on_continued(id: int) -> void:
    if id == _debug_id:
        _state = "running"
        _publish()
func snapshot() -> Dictionary:
    var active := _active_sessions()
    var owned := not _owner_session.is_empty() and _owner_session == _mcp_session
    var state := _state
    if not active.is_empty() and not owned:
        state = "running"
    return {"state":state,"runId":_run_id if owned and not _run_id.is_empty() else null,
        "scenePath":_scene_path,"connected":owned and _debug_id>=0 and state in ["running","paused","breaked"],
        "ownership":"session" if owned else ("external" if not active.is_empty() else "none"),
        "features":_features if owned else {"inspect":false,"scenePause":false,"gameCapture":false,"diagnostics":false,"performance":false},"errorCode":_error_code}
func _publish() -> void:
    if not _mcp_session.is_empty():
        runtime_event.emit("runtime.state",snapshot())
func _error(code: String, message: String) -> Dictionary:
    return {"__error":{"code":code,"message":message}}
func _cancel_pending(code: String, message: String) -> void:
    for ticket in _pending.values():
        ticket.response = _error(code,message)
    _pending.clear()
func _safe_scene(path: String) -> bool:
    if not path.begins_with("res://") or path.contains("..") or path.contains("\\") or not (path.ends_with(".tscn") or path.ends_with(".scn")):
        return false
    var directory := DirAccess.open("res://")
    var partial := ""
    for part in path.trim_prefix("res://").split("/"):
        if part.is_empty() or part.contains(":"):
            return false
        partial = part if partial.is_empty() else partial+"/"+part
        if directory.is_link(partial):
            return false
    return true
func _breakpoint_key(path: String, line: int) -> String:
    return "%s:%d" % [path, line]
func _safe_debug_script(path: String) -> bool:
    if not path.begins_with("res://") or not path.ends_with(".gd") or path.contains("..") or path.contains("\\") or path.contains("\u0000"):
        return false
    var relative := path.trim_prefix("res://")
    if relative.is_empty():
        return false
    var directory := DirAccess.open("res://")
    if directory == null:
        return false
    var partial := ""
    for part in relative.split("/"):
        if part.is_empty() or part.contains(":"):
            return false
        partial = part if partial.is_empty() else partial + "/" + part
        if directory.is_link(partial):
            return false
    return true
func _breakpoint_inventory() -> Array:
    var result: Array = []
    var script_editor = _editor.get_script_editor()
    for item in script_editor.get_breakpoints():
        var text := str(item)
        var split := text.rfind(":")
        if split <= 5:
            continue
        var path := text.substr(0, split)
        var line := int(text.substr(split + 1))
        if path.begins_with("res://") and path.ends_with(".gd") and line >= 1:
            result.append({"scriptPath":path,"line":line})
    result.sort_custom(func(a,b): return a.scriptPath < b.scriptPath or (a.scriptPath == b.scriptPath and a.line < b.line))
    return result
func _owned_breakpoint_inventory() -> Array:
    var result: Array = []
    for value in _mcp_breakpoints.values():
        result.append(value.duplicate(true))
    result.sort_custom(func(a,b): return a.scriptPath < b.scriptPath or (a.scriptPath == b.scriptPath and a.line < b.line))
    return result
func _cmdline_value(flag: String) -> String:
    var args := OS.get_cmdline_args()
    for i in range(args.size()):
        var current := str(args[i])
        if current == flag and i + 1 < args.size():
            return str(args[i + 1])
        if current.begins_with(flag + "="):
            return current.substr(flag.length() + 1)
    return ""
func debugger_info() -> Dictionary:
    var settings = _editor.get_editor_settings()
    var dap_port := int(_cmdline_value("--dap-port"))
    if dap_port <= 0:
        dap_port = int(settings.get_setting("network/debug_adapter/remote_port"))
    var debug_host := str(settings.get_setting("network/debug/remote_host"))
    var debug_port := int(settings.get_setting("network/debug/remote_port"))
    var debug_server := _cmdline_value("--debug-server")
    if debug_server.begins_with("tcp://127.0.0.1:"):
        debug_host = "127.0.0.1"
        debug_port = int(debug_server.trim_prefix("tcp://127.0.0.1:"))
    elif debug_server.begins_with("tcp://localhost:"):
        debug_host = "127.0.0.1"
        debug_port = int(debug_server.trim_prefix("tcp://localhost:"))
    if debug_host not in ["127.0.0.1", "localhost"]:
        return _error("DEBUGGER_UNAVAILABLE","Debugger endpoint is not loopback")
    if dap_port < 1024 or dap_port > 65535 or debug_port < 1024 or debug_port > 65535:
        return _error("DEBUGGER_UNAVAILABLE","Debugger endpoint port is invalid")
    return {
        "dapHost":"127.0.0.1","dapPort":dap_port,"debugHost":"127.0.0.1","debugPort":debug_port,
        "breakpointOwnerSessionId":_mcp_breakpoint_session if not _mcp_breakpoint_session.is_empty() else null,
        "breakpoints":_breakpoint_inventory(),"mcpBreakpoints":_owned_breakpoint_inventory()
    }
func set_mcp_breakpoint(params: Dictionary) -> Dictionary:
    var path := str(params.get("script_path",""))
    var line := int(params.get("line",0))
    if not _safe_debug_script(path):
        return _error("BREAKPOINT_INVALID_PATH","Breakpoint script is outside project GDScript scope")
    if line < 1:
        return _error("BREAKPOINT_INVALID_LINE","Breakpoint line must be 1-based")
    var key := _breakpoint_key(path,line)
    var already_owned := _mcp_breakpoints.has(key)
    if not already_owned:
        for item in _breakpoint_inventory():
            if item.scriptPath == path and item.line == line:
                return _error("BREAKPOINT_OWNERSHIP_CONFLICT","Breakpoint already exists outside MCP ownership")
    _mcp_breakpoints[key] = {"scriptPath":path,"line":line}
    var applied := false
    _mcp_origin_depth += 1
    for session in get_sessions():
        session.set_breakpoint(path,line,true)
        applied = true
    _mcp_origin_depth -= 1
    return {"scriptPath":path,"line":line,"applied":applied}
func remove_mcp_breakpoint(params: Dictionary) -> Dictionary:
    var path := str(params.get("script_path",""))
    var line := int(params.get("line",0))
    if not _safe_debug_script(path):
        return _error("BREAKPOINT_INVALID_PATH","Breakpoint script is outside project GDScript scope")
    if line < 1:
        return _error("BREAKPOINT_INVALID_LINE","Breakpoint line must be 1-based")
    var key := _breakpoint_key(path,line)
    if not _mcp_breakpoints.has(key):
        return _error("BREAKPOINT_NOT_OWNED","Breakpoint is not owned by this MCP session")
    _mcp_origin_depth += 1
    for session in get_sessions():
        session.set_breakpoint(path,line,false)
    _mcp_origin_depth -= 1
    _mcp_breakpoints.erase(key)
    return {"scriptPath":path,"line":line,"removed":true}
func _publish_breakpoints() -> void:
    if _mcp_session.is_empty():
        return
    runtime_event.emit("debugger.breakpoints", {"breakpoints":_breakpoint_inventory()})
func _breakpoint_set_in_tree(script: Script, line: int, _enabled: bool) -> void:
    if _mcp_origin_depth == 0:
        var path := script.resource_path if script != null else ""
        if not path.is_empty():
            _mcp_breakpoints.erase(_breakpoint_key(path,line))
        _publish_breakpoints()
func _breakpoints_cleared_in_tree() -> void:
    if _mcp_origin_depth == 0:
        _mcp_breakpoints.clear()
    _publish_breakpoints()
func launch(params: Dictionary) -> Dictionary:
    if _launching or _editor.is_playing_scene() or not _active_sessions().is_empty():
        return _error("RUNTIME_ALREADY_RUNNING","A game is already active")
    if params.get("mcpSessionId") != _mcp_session or str(params.get("runId","")).length()!=36:
        return _error("INVALID_REQUEST","Invalid runtime binding")
    var target := str(params.get("target",""))
    var scene := ""
    if target == "main":
        scene = str(ProjectSettings.get_setting("application/run/main_scene",""))
        if scene.begins_with("uid://"):
            var uid := ResourceUID.text_to_id(scene)
            scene = ResourceUID.get_id_path(uid) if ResourceUID.has_id(uid) else ""
    elif target == "current":
        var root = _editor.get_edited_scene_root()
        scene = root.scene_file_path if root else ""
    elif target == "path":
        scene = str(params.get("path",""))
    else:
        return _error("INVALID_REQUEST","Invalid launch target")
    if scene.is_empty():
        return _error("SCENE_NOT_SAVED","Scene has no saved path")
    if not _safe_scene(scene):
        return _error("INVALID_REQUEST","Scene path is outside the supported project scope")
    if not ResourceLoader.exists(scene) or not load(scene) is PackedScene:
        return _error("RUNTIME_START_FAILED","Scene cannot be loaded")
    _launching = true
    _run_id = str(params.runId)
    _owner_session = _mcp_session
    _scene_path = scene
    _state = "starting"
    _features = {"inspect":false,"scenePause":false,"gameCapture":false,"diagnostics":false,"performance":false}
    _error_code = null
    _debug_id = -1
    _publish()
    _editor.play_custom_scene(scene)
    var deadline := Time.get_ticks_msec()+15000
    while _state == "starting" and Time.get_ticks_msec()<deadline:
        await _editor.get_base_control().get_tree().process_frame
    _launching = false
    if _state in ["running","paused"]:
        return snapshot()
    if _state == "starting":
        _state = "failed"
        _error_code = "RUNTIME_START_TIMEOUT"
        _editor.stop_playing_scene()
        _publish()
    return _error(str(_error_code) if _error_code else "RUNTIME_START_FAILED","Game did not become ready")
func stop_run() -> Dictionary:
    if _active_sessions().size()>1:
        return _error("MULTIPLE_RUNTIME_SESSIONS","More than one debugger session is active")
    if not _editor.is_playing_scene() and _active_sessions().is_empty() and not _launching:
        _state = "stopped"
        return {"stopped":false,"runId":_run_id if not _run_id.is_empty() else null}
    if _owner_session != _mcp_session or _owner_session.is_empty():
        return _error("RUNTIME_NOT_OWNED","This MCP session does not own the game")
    if _stopping:
        return _error("BUSY","Stop already in progress")
    _stopping = true
    _state = "stopping"
    _cancel_pending("RUNTIME_NOT_CONNECTED","Game is stopping")
    _publish()
    _editor.stop_playing_scene()
    var deadline := Time.get_ticks_msec()+5000
    while (_editor.is_playing_scene() or not _active_sessions().is_empty()) and Time.get_ticks_msec()<deadline:
        await _editor.get_base_control().get_tree().process_frame
    _stopping = false
    if _editor.is_playing_scene() or not _active_sessions().is_empty():
        return _error("RUNTIME_STOP_TIMEOUT","Game did not stop")
    _state = "stopped"
    _debug_id = -1
    _publish()
    return {"stopped":true,"runId":_run_id}
func forward(method: String, params: Dictionary) -> Dictionary:
    if _active_sessions().size()>1:
        return _error("MULTIPLE_RUNTIME_SESSIONS","More than one debugger session is active")
    if _state == "breaked":
        return _error("RUNTIME_BREAKED","Game interrupted in debugger")
    if _owner_session != _mcp_session or _owner_session.is_empty():
        return _error("RUNTIME_NOT_OWNED","Game belongs to another session")
    if _debug_id<0 or not get_session(_debug_id).is_active() or not _state in ["running","paused"]:
        return _error("RUNTIME_NOT_CONNECTED","Runtime is not ready")
    if params.get("_run_id") != _run_id:
        return _error("RUNTIME_NOT_CONNECTED","Runtime generation changed")
    if _pending.size()>=32:
        return _error("BUSY","Runtime queue is full")
    _next_id += 1
    var id := "runtime-%d" % _next_id
    var ticket := {"response":null,"runId":_run_id,"debugId":_debug_id}
    _pending[id] = ticket
    var values := params.duplicate()
    values.erase("_run_id")
    get_session(_debug_id).send_message("godot_mcp:request",[{"protocol":1,"mcpSessionId":_mcp_session,"runId":_run_id,"requestId":id,"method":method,"params":values}])
    var deadline := Time.get_ticks_msec()+(8000 if method=="visual.capture_game" else 3000)
    while ticket.response == null and Time.get_ticks_msec()<deadline:
        await _editor.get_base_control().get_tree().process_frame
    _pending.erase(id)
    if ticket.response == null:
        return _error("TIMEOUT","Runtime response deadline exceeded")
    return ticket.response
func _capture(message: String, data: Array, session_id: int) -> bool:
    if message == "godot_mcp:hello":
        if _state == "starting" and _owner_session == _mcp_session and not _mcp_session.is_empty() and _active_sessions().size()==1:
            _debug_id = session_id
            get_session(session_id).send_message("godot_mcp:bind",[{"runId":_run_id,"mcpSessionId":_mcp_session}])
        return true
    if data.size()!=1 or not data[0] is Dictionary or session_id!=_debug_id:
        return false
    var packet: Dictionary = data[0]
    if packet.get("mcpSessionId")!=_mcp_session or _owner_session!=_mcp_session:
        return false
    if message.begins_with("godot_mcp:capture_") and packet.get("runId")==_run_id:
        var id := str(packet.get("requestId",""))
        if not _pending.has(id):
            return true
        var ticket: Dictionary = _pending[id]
        if ticket.response != null:
            return true
        if message == "godot_mcp:capture_begin":
            if ticket.has("assembler"):
                ticket.response = _error("INVALID_CAPTURE_PAYLOAD","Duplicate capture header")
                return true
            var assembler = preload("res://addons/godot_mcp/debugger/capture_assembler.gd").new()
            if not assembler.begin(packet):
                ticket.response = _error("INVALID_CAPTURE_PAYLOAD","Invalid capture header")
            ticket["assembler"] = assembler
        elif not ticket.has("assembler") or packet.get("captureId")!=ticket.assembler.metadata.get("captureId"):
            ticket.response = _error("INVALID_CAPTURE_PAYLOAD","Capture identity mismatch")
        elif message == "godot_mcp:capture_chunk":
            if not ticket.assembler.push(int(packet.get("index",-1)),str(packet.get("data",""))):
                ticket.response = _error("INVALID_CAPTURE_PAYLOAD","Invalid capture fragment")
        elif message == "godot_mcp:capture_end":
            ticket.response = ticket.assembler.finish()
        return true
    if message == "godot_mcp:ready" and packet.get("runId")==_run_id and _state=="starting":
        _state = str(packet.status.state)
        _features = packet.status.features
        _scene_path = packet.status.scenePath
        _publish()
        return true
    if message == "godot_mcp:diagnostics" and packet.get("batch",{}).get("runId")==_run_id:
        runtime_event.emit("runtime.diagnostics",packet.batch)
        return true
    if message == "godot_mcp:response" and packet.get("runId")==_run_id:
        var id := str(packet.get("requestId",""))
        if not _pending.has(id):
            return true
        if _pending[id].response != null:
            return true
        var result: Dictionary = packet.get("result",{}) if packet.get("ok",false) else {"__error":packet.get("error",{})}
        _pending[id].response = result
        if result.get("state","") in ["running","paused"]:
            _state = result.state
            _publish()
        return true
    return false
