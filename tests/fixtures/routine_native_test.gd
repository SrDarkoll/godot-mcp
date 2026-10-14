extends SceneTree

class TestEditor extends RefCounted:
    var scene: Node
    var save_error: int = OK
    var close_error: int = OK
    var events: Array[String] = []
    func get_edited_scene_root(): return scene
    func save_scene() -> int:
        events.append("save")
        return save_error
    func close_scene() -> int:
        events.append("close")
        return close_error

class CloseOnlyEditor extends RefCounted:
    var scene: Node
    var closed := false
    func get_edited_scene_root(): return scene
    func close_scene() -> int:
        closed = true
        return OK

var failures: Array[String] = []
var checks := 0

func check(condition: bool, message: String) -> void:
    checks += 1
    if not condition: failures.append(message)

func write_source(path: String, source: String) -> void:
    var file := FileAccess.open(path, FileAccess.WRITE)
    check(file != null, "fixture source must be writable")
    if file:
        file.store_string(source)
        file.close()

func names(entries: Array) -> Array:
    return entries.map(func(entry): return entry.name)

# Allows the red regression to run against the original no-parameter handler.
func close_with(handler, args: Dictionary) -> Dictionary:
    for method in handler.get_method_list():
        if method.name == "close_scene" and not method.args.is_empty():
            return handler.call("close_scene", args)
    return handler.close_scene()

func _init() -> void:
    call_deferred("run_tests")

func run_tests() -> void:
    var scene := Node2D.new()
    scene.name = "Routine"
    scene.scene_file_path = "res://main.tscn"
    root.add_child(scene)
    var editor := TestEditor.new()
    editor.scene = scene
    var scripts = load("res://addons/godot_mcp/bridge/handlers/script_handlers.gd").new(editor)
    var source_path := "res://changing.gd"
    write_source(source_path, "extends Node2D\nsignal old_signal\nvar old_property: int = 1\nfunc old_method() -> int:\n    return 1\n")
    var cached: Script = load(source_path)
    check(cached != null and cached.can_instantiate(), "original script must compile")
    scene.set_script(cached)
    write_source(source_path, "extends Node2D\nsignal new_signal\nvar new_property: int = 2\nfunc new_method() -> int:\n    return 2\n")
    var fresh: Dictionary = scripts.inspect({"path":source_path})
    check(not fresh.has("__error"), "fresh disk inspection must succeed")
    check(names(fresh.get("methods",[])).has("new_method"), "disk inspect must report the new method")
    check(not names(fresh.get("methods",[])).has("old_method"), "disk inspect must not return cached methods")
    check(names(fresh.get("properties",[])).has("new_property"), "disk inspect must report the new property")
    check(names(fresh.get("signals",[])).has("new_signal"), "disk inspect must report the new signal")
    check(fresh.get("path") == source_path, "inspection must retain the caller's source path")
    check(fresh.get("inspection_source") == "disk", "disk metadata must be labelled")
    check(scene.get_script() == cached, "inspection must preserve the live attached script identity")
    check(names(cached.get_script_method_list()).has("old_method"), "inspection must not reload the cached live script")
    check(load(source_path) == cached, "inspection must preserve the original resource cache entry")
    var attached: Dictionary = scripts.inspect({"node_path":"/Routine"})
    check(attached.get("inspection_source") == "attached", "attached metadata must be labelled")
    check(names(attached.get("methods",[])).has("old_method"), "node inspection must describe the attached instance")
    write_source(source_path, "extends Node2D\nfunc broken(\n")
    var invalid: Dictionary = scripts.inspect({"path":source_path})
    check(invalid.has("__error"), "invalid disk source must not masquerade as cached valid metadata")
    check(scene.get_script() == cached and cached.can_instantiate(), "invalid disk inspection must not invalidate the live script")
    check(DirAccess.remove_absolute(ProjectSettings.globalize_path(source_path)) == OK, "fixture source must be removable")
    var missing: Dictionary = scripts.inspect({"path":source_path})
    check(missing.get("__error",{}).get("code") == "NOT_FOUND", "deleted disk source must not fall back to cached metadata")

    var named_cached: Script = load("res://named.gd")
    write_source("res://named.gd", "class_name RoutineNamedFixture\nextends Node2D\nfunc named_new() -> void:\n    pass\n")
    var named_result: Dictionary = scripts.inspect({"path":"res://named.gd"})
    check(not named_result.has("__error") and names(named_result.get("methods",[])).has("named_new"), "registered class_name source must compile at its original path")
    check(names(named_cached.get_script_method_list()).has("named_old"), "class_name inspection must preserve the cached class")
    write_source("res://abstract.gd", "@abstract\nextends Node2D\nfunc abstract_method() -> void:\n    pass\n")
    var abstract_result: Dictionary = scripts.inspect({"path":"res://abstract.gd"})
    check(not abstract_result.has("__error") and names(abstract_result.get("methods",[])).has("abstract_method"), "valid abstract scripts must remain inspectable")
    check(DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://nested")) == OK, "relative-path fixture directory must exist")
    write_source("res://nested/base.gd", "extends Node2D\n")
    write_source("res://nested/relative.gd", "extends \"base.gd\"\nfunc relative_method() -> void:\n    pass\n")
    var relative_result: Dictionary = scripts.inspect({"path":"res://nested/relative.gd"})
    check(not relative_result.has("__error") and relative_result.get("base_type") == "Node2D", "relative script dependencies must resolve from the source directory")

    var recovery_type = load("res://addons/godot_mcp/bridge/handlers/recovery_handlers.gd")
    var recovery = recovery_type.new(editor)
    var normal: Dictionary = close_with(recovery, {})
    check(normal.get("closed",false) and normal.get("saved",false), "normal close must confirm that it saved")
    check(editor.events == ["save","close"], "normal close must save before invoking Godot's destructive close API")
    editor.events.clear()
    editor.save_error = ERR_CANT_CREATE
    var failed: Dictionary = close_with(recovery, {})
    check(failed.get("__error",{}).get("code") == "SCENE_SAVE_FAILED", "failed save must give a structured failure")
    check(editor.events == ["save"], "failed save must never close the scene")
    editor.events.clear()
    editor.save_error = OK
    scene.scene_file_path = ""
    var unnamed: Dictionary = close_with(recovery, {})
    check(unnamed.get("__error",{}).get("code") == "SCENE_SAVE_REQUIRED", "unnamed scene must require explicit save_as")
    check(editor.events.is_empty(), "unnamed scene must neither auto-save nor close")
    var discarded: Dictionary = close_with(recovery, {"discard_changes":true})
    check(discarded.get("closed",false) and not discarded.get("saved",true), "explicit discard must not claim a save")
    check(editor.events == ["close"], "explicit discard may bypass save only when requested")
    editor.events.clear()
    editor.scene = null
    var absent: Dictionary = close_with(recovery, {})
    check(not absent.get("closed",true) and editor.events.is_empty(), "no scene must be a harmless no-op")
    editor.scene = scene
    scene.scene_file_path = "res://main.tscn"
    editor.close_error = ERR_UNAVAILABLE
    var close_failed: Dictionary = close_with(recovery, {})
    check(close_failed.get("__error",{}).get("code") == "EDITOR_CLOSE_FAILED", "close failure must not claim success")
    var limited := CloseOnlyEditor.new()
    limited.scene = scene
    var unavailable: Dictionary = close_with(recovery_type.new(limited), {})
    check(unavailable.get("__error",{}).get("code") == "CAPABILITY_UNAVAILABLE", "missing save API must fail closed")
    check(not limited.closed, "missing save API must never discard a scene")
    print("MCP_ROUTINE_NATIVE " + JSON.stringify({"checks":checks,"failures":failures}))
    scene.queue_free()
    quit(0 if failures.is_empty() else 1)
