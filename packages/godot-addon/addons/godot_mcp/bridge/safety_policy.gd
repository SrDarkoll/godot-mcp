@tool
class_name SafetyPolicy
extends RefCounted

# Defense in depth. Keep this list aligned with the Node-side
# packages/server/src/security/reflection-safety.ts policy. The MCP server
# rejects these methods before an RPC is sent, and the addon rejects them
# again if a bridge call reaches Godot through another path.
const BLOCKED_METHODS: Array[String] = [
	"free",
	"queue_free",
	"crash",
	"execute",
	"create_process",
	"kill",
	"shell_open",
	"open_shell",
	"call",
	"callv",
	"call_deferred",
	"call_deferred_thread_group",
	"set",
	"set_indexed",
	"set_deferred",
	"set_deferred_thread_group",
	"set_script",
	"rpc",
	"rpc_id",
	"rpc_config",
	"propagate_call",
	"replace_by",
	"remove_child",
	"add_child",
	"add_sibling",
	"reparent"
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
