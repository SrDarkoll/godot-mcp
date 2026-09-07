extends Node

var health := 100
var inventory := [{"name":"wrench","stats":{"power":7,"tags":["metal","tool"]}}]
var _started := false

func _process(_delta: float) -> void:
    if _started or not FileAccess.file_exists("res://.godot-mcp/start-debug-flow"):
        return
    _started = true
    DirAccess.remove_absolute(ProjectSettings.globalize_path("res://.godot-mcp/start-debug-flow"))
    start_debug_flow()

func start_debug_flow() -> void:
    var local_value := 42
    var nested := {"numbers":[1,2,3],"meta":{"active":true}}
    _level_one(local_value, nested) # MCP_BP_ENTRY

func _level_one(value: int, nested: Dictionary) -> void:
    var doubled := value * 2 # MCP_STEP_OVER
    _level_two(doubled, nested) # MCP_STEP_INTO
    doubled += 1 # MCP_STEP_OUT_RETURN

func _level_two(value: int, nested: Dictionary) -> void:
    var final_value: int = value + int(nested["numbers"][0]) # MCP_STEP_OUT
    print("DEBUG_FLOW:%d" % final_value)
