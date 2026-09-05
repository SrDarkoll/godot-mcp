@tool
extends EditorPlugin

var _bridge: Node

func _enter_tree() -> void:
    _bridge = preload("res://addons/godot_mcp/bridge/bridge_client.gd").new()
    add_child(_bridge)
    _bridge.start(EditorInterface)

func _exit_tree() -> void:
    if is_instance_valid(_bridge):
        _bridge.stop()
        _bridge.queue_free()
