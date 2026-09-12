@tool
class_name SafetyPolicy
extends RefCounted

# Keep the method names synchronized with the server reflection policy.
const NATIVE_METHODS = {
    "Object": ["get_class", "is_class", "get_instance_id", "has_method", "has_signal"],
    "Node": ["get_name", "get_path", "get_child_count", "is_inside_tree", "is_node_ready"],
    "CharacterBody2D": ["is_on_floor", "is_on_wall", "is_on_ceiling", "get_floor_normal"],
    "CharacterBody3D": ["is_on_floor", "is_on_wall", "is_on_ceiling", "get_floor_normal"],
    "Texture2D": ["get_width", "get_height", "get_size"],
    "AudioStream": ["get_length"],
}
const BLOCKED_METHODS = [
    "free", "queue_free", "crash", "execute", "create_process", "kill",
    "shell_open", "open_shell", "call", "callv", "call_deferred",
    "call_deferred_thread_group", "call_thread_safe", "rpc", "rpc_id",
    "set", "set_indexed", "set_deferred", "set_deferred_thread_group",
    "set_thread_safe", "set_script", "emit_signal", "notification",
    "propagate_call", "propagate_notification",
]

static func is_method_allowed(target: Object, method: String, trusted_script: bool = false) -> bool:
    # Script resources use meta-call dispatch; inspect them through script.inspect.
    # Trusted custom calls belong on scene/resource instances, not a Script object.
    if target is Script:
        return false
    if method.is_empty() or method != method.strip_edges() or method.begins_with("_"):
        return false
    if BLOCKED_METHODS.has(method) or not is_instance_valid(target) or not target.has_method(method):
        return false
    # Script overrides of native names also need explicit trust.
    var script: Script = target.get_script() as Script
    while script is Script:
        for entry in script.get_script_method_list():
            if str(entry.get("name", "")) == method:
                return trusted_script
        script = script.get_base_script()
    for class_name_value in NATIVE_METHODS:
        if target.is_class(class_name_value) and NATIVE_METHODS[class_name_value].has(method):
            return true
    return false
