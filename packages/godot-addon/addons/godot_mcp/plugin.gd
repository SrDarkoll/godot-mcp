@tool
extends EditorPlugin

var _bridge: Node = null
var _debugger = null

func _enter_tree() -> void:
    if OS.get_environment("GODOT_MCP_HEADLESS_CHILD") == "1":
        return
    _debugger = preload("res://addons/godot_mcp/debugger/editor_debugger.gd").new()
    _debugger.configure(EditorInterface)
    add_debugger_plugin(_debugger)
    _bridge = preload("res://addons/godot_mcp/bridge/bridge_client.gd").new()
    add_child(_bridge)
    _bridge.start(EditorInterface,_debugger)

func _exit_tree() -> void:
    if is_instance_valid(_bridge):
        _bridge.stop()
        _bridge.queue_free()
    if _debugger != null:
        remove_debugger_plugin(_debugger)
