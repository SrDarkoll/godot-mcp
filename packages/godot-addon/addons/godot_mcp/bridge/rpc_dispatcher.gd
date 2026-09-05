@tool
extends RefCounted

var _project_info
var _scene_tree
var _object_handlers
var _scene_handlers
var _node_handlers
var _resource_handlers
var _script_handlers
var _signal_handlers
var _project_handlers

func _init(editor_interface) -> void:
    _project_info = preload("res://addons/godot_mcp/bridge/handlers/project_info.gd").new(editor_interface)
    _scene_tree = preload("res://addons/godot_mcp/bridge/handlers/scene_tree.gd").new(editor_interface)
    _object_handlers = preload("res://addons/godot_mcp/bridge/handlers/object_handlers.gd").new(editor_interface)
    _scene_handlers = preload("res://addons/godot_mcp/bridge/handlers/scene_handlers.gd").new(editor_interface)
    _node_handlers = preload("res://addons/godot_mcp/bridge/handlers/node_handlers.gd").new(editor_interface)
    _resource_handlers = preload("res://addons/godot_mcp/bridge/handlers/resource_handlers.gd").new(editor_interface)
    _script_handlers = preload("res://addons/godot_mcp/bridge/handlers/script_handlers.gd").new(editor_interface)
    _signal_handlers = preload("res://addons/godot_mcp/bridge/handlers/signal_handlers.gd").new(editor_interface)
    _project_handlers = preload("res://addons/godot_mcp/bridge/handlers/project_handlers.gd").new(editor_interface)

func _failure(request_id: String, code: String, message: String) -> Dictionary:
    return {
        "id": request_id if not request_id.is_empty() else "invalid-request",
        "ok": false,
        "error": { "code": code, "message": message }
    }

func dispatch(raw_text: String) -> Dictionary:
    var parsed = JSON.parse_string(raw_text)
    if typeof(parsed) != TYPE_DICTIONARY:
        return _failure("invalid-request", "INVALID_REQUEST", "Request must be a JSON object")

    var request: Dictionary = parsed
    var request_id := str(request.get("id", ""))
    if request_id.is_empty() or int(request.get("protocol", 0)) != 1:
        return _failure(request_id, "INVALID_REQUEST", "Request id and protocol=1 are required")
    if typeof(request.get("method")) != TYPE_STRING or typeof(request.get("params", {})) != TYPE_DICTIONARY:
        return _failure(request_id, "INVALID_REQUEST", "Request method and params are invalid")

    var method: String = request.method
    var params: Dictionary = request.get("params", {})
    var result
    match method:
        "project.info":
            result = _project_info.run(params)
        "scene.get_tree":
            result = _scene_tree.run(params)
        "object.get_class":
            result = _object_handlers.get_class(params)
        "object.get_property_list":
            result = _object_handlers.get_property_list(params)
        "object.get_method_list":
            result = _object_handlers.get_method_list(params)
        "object.get_signal_list":
            result = _object_handlers.get_signal_list(params)
        "object.get":
            result = _object_handlers.get_property(params)
        "object.set":
            result = _object_handlers.set_property(params)
        "object.call":
            result = _object_handlers.call_method(params)
        "scene.create":
            result = _scene_handlers.create(params)
        "scene.open":
            result = _scene_handlers.open(params)
        "scene.save":
            result = _scene_handlers.save(params)
        "scene.save_as":
            result = _scene_handlers.save_as(params)
        "scene.reload":
            result = _scene_handlers.reload(params)
        "scene.instantiate":
            result = _scene_handlers.instantiate(params)
        "scene.get_root":
            result = _scene_handlers.get_root(params)
        "node.create":
            result = _node_handlers.create(params)
        "node.delete":
            result = _node_handlers.delete(params)
        "node.duplicate":
            result = _node_handlers.duplicate(params)
        "node.rename":
            result = _node_handlers.rename(params)
        "node.reparent":
            result = _node_handlers.reparent(params)
        "node.move":
            result = _node_handlers.move(params)
        "node.inspect":
            result = _node_handlers.inspect(params)
        "node.list_children":
            result = _node_handlers.list_children(params)
        "node.get_property":
            result = _node_handlers.get_property(params)
        "node.set_property":
            result = _node_handlers.set_property(params)
        "node.get_properties":
            result = _node_handlers.get_properties(params)
        "resource.load":
            result = _resource_handlers.load_resource(params)
        "resource.inspect":
            result = _resource_handlers.inspect(params)
        "resource.create":
            result = _resource_handlers.create(params)
        "resource.set_property":
            result = _resource_handlers.set_property(params)
        "resource.save":
            result = _resource_handlers.save(params)
        "resource.duplicate":
            result = _resource_handlers.duplicate(params)
        "script.create":
            result = _script_handlers.create(params)
        "script.attach":
            result = _script_handlers.attach(params)
        "script.detach":
            result = _script_handlers.detach(params)
        "script.inspect":
            result = _script_handlers.inspect(params)
        "script.validate":
            result = _script_handlers.validate(params)
        "signal.list":
            result = _signal_handlers.list(params)
        "signal.connections":
            result = _signal_handlers.connections(params)
        "signal.connect":
            result = _signal_handlers.connect_signal(params)
        "signal.disconnect":
            result = _signal_handlers.disconnect_signal(params)
        "project.settings.get":
            result = _project_handlers.get_setting(params)
        "project.settings.set":
            result = _project_handlers.set_setting(params)
        "project.input.list":
            result = _project_handlers.list_input_actions(params)
        "project.input.add_action":
            result = _project_handlers.add_input_action(params)
        "project.input.remove_action":
            result = _project_handlers.remove_input_action(params)
        _:
            return _failure(request_id, "METHOD_NOT_FOUND", "Unknown method: %s" % method)

    if typeof(result) == TYPE_DICTIONARY and result.has("__error"):
        var err: Dictionary = result["__error"]
        return _failure(request_id, str(err.get("code", "INTERNAL_ERROR")), str(err.get("message", "Error occurred")))

    return { "id": request_id, "ok": true, "result": result }
