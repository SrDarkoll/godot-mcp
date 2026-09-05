@tool
extends RefCounted

var _project_info
var _scene_tree
var _object_handlers

func _init(editor_interface) -> void:
    _project_info = preload("res://addons/godot_mcp/bridge/handlers/project_info.gd").new(editor_interface)
    _scene_tree = preload("res://addons/godot_mcp/bridge/handlers/scene_tree.gd").new(editor_interface)
    _object_handlers = preload("res://addons/godot_mcp/bridge/handlers/object_handlers.gd").new(editor_interface)

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
        _:
            return _failure(request_id, "METHOD_NOT_FOUND", "Unknown method: %s" % method)

    if typeof(result) == TYPE_DICTIONARY and result.has("__error"):
        var err: Dictionary = result["__error"]
        return _failure(request_id, str(err.get("code", "INTERNAL_ERROR")), str(err.get("message", "Error occurred")))

    return { "id": request_id, "ok": true, "result": result }
