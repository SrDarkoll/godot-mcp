@tool
class_name SafetyPolicy
extends RefCounted

const BLOCKED_METHODS: Array[String] = [
    "free",
    "queue_free",
    "crash",
    "execute",
    "create_process",
    "kill",
    "shell_open",
    "open_shell"
]

static func is_method_allowed(_target: Object, method: String) -> bool:
    var normalized := method.strip_edges()
    if normalized.is_empty():
        return false
    if normalized.begins_with("_"):
        return false
    if BLOCKED_METHODS.has(normalized):
        return false
    return true