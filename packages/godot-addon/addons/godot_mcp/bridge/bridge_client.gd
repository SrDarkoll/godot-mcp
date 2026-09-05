@tool
extends Node

const DESCRIPTOR_PATH := "res://.godot-mcp/runtime/bridge.json"
const ADDON_VERSION := "0.1.0"
const PROTOCOL_VERSION := 1
const DESCRIPTOR_POLL_SECONDS := 1.0

var _editor_interface
var _dispatcher
var _socket: WebSocketPeer
var _hello_sent := false
var _poll_elapsed := DESCRIPTOR_POLL_SECONDS

func start(editor_interface) -> void:
    _editor_interface = editor_interface
    _dispatcher = preload("res://addons/godot_mcp/bridge/rpc_dispatcher.gd").new(editor_interface)
    set_process(true)

func stop() -> void:
    set_process(false)
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
    if state == WebSocketPeer.STATE_OPEN:
        if not _hello_sent:
            _send_hello()
        _drain_messages()
    elif state == WebSocketPeer.STATE_CLOSED:
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
    var error := socket.connect_to_url("ws://127.0.0.1:%d" % port)
    if error != OK:
        return
    _socket = socket
    _hello_sent = false

func _send_hello() -> void:
    var descriptor := _read_descriptor()
    if descriptor.is_empty() or _socket == null:
        return
    var hello := {
        "type": "hello",
        "token": str(descriptor.get("token", "")),
        "protocol": PROTOCOL_VERSION,
        "addonVersion": ADDON_VERSION,
        "godotVersion": Engine.get_version_info().string,
        "projectRoot": ProjectSettings.globalize_path("res://").replace("\\", "/").trim_suffix("/"),
        "capabilities": {
            "editor": true,
            "runtime": false,
            "debugger": false,
            "viewport2d": _editor_interface.has_method("get_editor_viewport_2d"),
            "viewport3d": _editor_interface.has_method("get_editor_viewport_3d"),
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
            continue
        var response: Dictionary = _dispatcher.dispatch(text)
        _socket.send_text(JSON.stringify(response))
