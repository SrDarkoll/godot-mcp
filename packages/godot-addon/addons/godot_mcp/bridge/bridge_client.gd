@tool
extends Node

const DESCRIPTOR_PATH := "res://.godot-mcp/runtime/bridge.json"
const ADDON_VERSION := "0.3.0"
const PROTOCOL_VERSION := 1
const DESCRIPTOR_POLL_SECONDS := 1.0

var _editor_interface
var _dispatcher
var _socket: WebSocketPeer
var _hello_sent := false
var _authenticated := false
var _generation := 0
var _queue: Array = []
var _consuming := false
var _poll_elapsed := DESCRIPTOR_POLL_SECONDS
var _connection_descriptor: Dictionary = {}
var _connection_started_ms := 0
var _runtime
var _event_sequence := 0
var _priority_count := 0

func start(editor_interface, runtime = null) -> void:
    _editor_interface = editor_interface
    _runtime = runtime
    _dispatcher = preload("res://addons/godot_mcp/bridge/rpc_dispatcher.gd").new(editor_interface,runtime)
    if _runtime != null:
        _runtime.runtime_event.connect(_send_event)
    set_process(true)

func stop() -> void:
    set_process(false)
    _invalidate()
    if _socket != null:
        _socket.close(1000, "plugin stopped")
        _socket.poll()
    _socket = null
    _hello_sent = false

func _process(delta: float) -> void:
    if _socket == null:
        _poll_elapsed += delta
        if _poll_elapsed >= DESCRIPTOR_POLL_SECONDS:
            _poll_elapsed = 0.0
            _try_connect()
        return

    _socket.poll()
    var state := _socket.get_ready_state()
    _poll_elapsed += delta
    if _poll_elapsed >= DESCRIPTOR_POLL_SECONDS:
        _poll_elapsed = 0.0
        var current := _read_descriptor()
        # A restart can replace the descriptor while a TCP connection to the old
        # port is still pending. Do not wait for the OS connection timeout.
        if current != _connection_descriptor or (state == WebSocketPeer.STATE_CONNECTING and Time.get_ticks_msec() - _connection_started_ms >= 5000):
            _socket.close()
            _socket = null
            _hello_sent = false
            _invalidate()
            _try_connect()
            return
    if state == WebSocketPeer.STATE_OPEN:
        if not _hello_sent:
            _send_hello()
        _drain_messages()
    elif state == WebSocketPeer.STATE_CLOSED:
        _invalidate()
        _socket = null
        _hello_sent = false
        _poll_elapsed = DESCRIPTOR_POLL_SECONDS

func _read_descriptor() -> Dictionary:
    if not FileAccess.file_exists(DESCRIPTOR_PATH):
        return {}
    var file := FileAccess.open(DESCRIPTOR_PATH, FileAccess.READ)
    if file == null:
        return {}
    var parsed = JSON.parse_string(file.get_as_text())
    return parsed if typeof(parsed) == TYPE_DICTIONARY else {}

func _try_connect() -> void:
    var descriptor := _read_descriptor()
    if descriptor.is_empty():
        return
    if str(descriptor.get("host", "")) != "127.0.0.1":
        push_warning("Godot MCP ignored a non-loopback bridge descriptor")
        return
    var port := int(descriptor.get("port", 0))
    var token := str(descriptor.get("token", ""))
    if port <= 0 or port > 65535 or token.length() < 32 or int(descriptor.get("protocol", 0)) != PROTOCOL_VERSION:
        push_warning("Godot MCP ignored an invalid bridge descriptor")
        return

    var socket := WebSocketPeer.new()
    socket.outbound_buffer_size = 24 * 1024 * 1024
    var error := socket.connect_to_url("ws://127.0.0.1:%d" % port)
    if error != OK:
        return
    _socket = socket
    _connection_descriptor = descriptor
    _connection_started_ms = Time.get_ticks_msec()
    _hello_sent = false

func _send_hello() -> void:
    var descriptor := _connection_descriptor
    if descriptor.is_empty() or _socket == null:
        return
    var compatibility: Dictionary = _dispatcher.compatibility_manifest()
    var effective_capabilities: Dictionary = compatibility.get("capabilities", {})
    var viewport2d: Dictionary = effective_capabilities.get("visual.viewport2d.capture", {})
    var viewport3d: Dictionary = effective_capabilities.get("visual.viewport3d.capture", {})
    var hello := {
        "type": "hello",
        "token": str(descriptor.get("token", "")),
        "protocol": PROTOCOL_VERSION,
        "addonVersion": ADDON_VERSION,
        "godotVersion": Engine.get_version_info().string,
        "projectRoot": ProjectSettings.globalize_path("res://").replace("\\", "/").trim_suffix("/"),
        "compatibility": compatibility,
        "capabilities": {
            "editor": true,
            "runtime": _runtime != null,
            "debugger": _runtime != null,
            "viewport2d": str(viewport2d.get("status", "unsupported")) != "unsupported",
            "viewport3d": str(viewport3d.get("status", "unsupported")) != "unsupported",
            "undoRedo": true
        }
    }
    if _socket.send_text(JSON.stringify(hello)) == OK:
        _hello_sent = true

func _drain_messages() -> void:
    while _socket != null and _socket.get_available_packet_count() > 0:
        var text := _socket.get_packet().get_string_from_utf8()
        var parsed = JSON.parse_string(text)
        if typeof(parsed) == TYPE_DICTIONARY and str(parsed.get("type", "")) == "hello_ack":
            _authenticated = int(parsed.get("protocol", 0)) == PROTOCOL_VERSION
            _event_sequence = 0
            if _authenticated and _runtime != null:
                _runtime.bind_session(str(parsed.get("sessionId","")))
            continue
        if not _authenticated:
            continue
        if typeof(parsed)==TYPE_DICTIONARY and str(parsed.get("method","")) in ["runtime.status","runtime.stop","project.stop"]:
            if _priority_count < 4:
                _priority_count += 1
                _consume_priority(text,_socket,_generation)
            else:
                _socket.send_text(JSON.stringify({"id":parsed.get("id","invalid-request"),"ok":false,"error":{"code":"BUSY","message":"Control queue is full"}}))
            continue
        if _queue.size() >= 64:
            var request_id := str(parsed.get("id", "invalid-request")) if typeof(parsed) == TYPE_DICTIONARY else "invalid-request"
            _socket.send_text(JSON.stringify({"id": request_id, "ok": false, "error": {"code": "BUSY", "message": "Editor request queue is full"}}))
            continue
        _queue.append({"text": text, "socket": _socket, "generation": _generation})
    if not _consuming and not _queue.is_empty():
        _consume_queue()

func _invalidate() -> void:
    _generation += 1
    _authenticated = false
    _queue.clear()
    if _runtime != null:
        _runtime.unbind_session()

func _send_event(name: String, data: Dictionary) -> void:
    if not _authenticated or _socket == null or _socket.get_ready_state()!=WebSocketPeer.STATE_OPEN:
        return
    _event_sequence += 1
    _socket.send_text(JSON.stringify({"type":"event","protocol":1,"sessionId":str(_connection_descriptor.get("sessionId","")),"sequence":_event_sequence,"event":name,"data":data}))

func _consume_priority(text: String, socket: WebSocketPeer, generation: int) -> void:
    var response: Dictionary = await _dispatcher.dispatch(text)
    _priority_count -= 1
    if socket == _socket and generation == _generation and _authenticated:
        socket.send_text(JSON.stringify(response))

func _consume_queue() -> void:
    _consuming = true
    while not _queue.is_empty():
        var request: Dictionary = _queue.pop_front()
        var response: Dictionary = await _dispatcher.dispatch(request.text)
        if request.generation == _generation and request.socket == _socket and _authenticated:
            if _socket != null and _socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
                var error := _socket.send_text(JSON.stringify(response))
                if error != OK:
                    _socket.close(1011, "Unable to send editor response")
                    _invalidate()
    _consuming = false
