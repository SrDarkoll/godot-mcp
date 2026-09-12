extends SceneTree

const Handler = preload("res://addons/godot_mcp/bridge/handlers/object_handlers.gd")
class FakeEditor:
    extends RefCounted
    var scene: Node
    func get_edited_scene_root():
        return scene

class CustomNode:
    extends Node
    static var metadata_calls = 0
    static func get_script_method_list():
        metadata_calls += 1
        return []
    func custom_action():
        return 42

var failures: Array[String] = []
func check(condition: bool, message: String):
    if not condition:
        failures.append(message)

func _init():
    var scene = CustomNode.new()
    scene.name = "Main"
    root.add_child(scene)
    var child = Node.new()
    child.name = "Child"
    scene.add_child(child)
    var outside = Node.new()
    root.add_child(outside)
    var editor = FakeEditor.new()
    editor.scene = scene
    var handler = Handler.new(editor)
    for method in ["call", "callv", "call_deferred", "set_deferred", "emit_signal", "notification", "set_script", "queue_free", "unknown_native_method"]:
        # Empty args ensures a vulnerable handler cannot delete anything in this fixture.
        var result = handler.call_method({"node_path":".", "method":method, "args":[]})
        check(result.get("__error",{}).get("code") == "SAFETY_VIOLATION", "allowed method: " + method)
    check(handler.resolve_target({"node_path":".."}) == null, "parent escape")
    check(handler.resolve_target({"node_path":"Child/../.."}) == null, "nested parent escape")
    check(handler.resolve_target({"object_id":outside.get_instance_id()}) == null, "foreign object id")
    for file in ["node_handlers", "scene_handlers", "script_handlers", "signal_handlers", "editor_handlers"]:
        var module: GDScript = load("res://addons/godot_mcp/bridge/handlers/"+file+".gd")
        var scoped = module.new(editor)
        check(scoped._resolve_node(scene,"..") == null, file+" parent escape")
        check(scoped._resolve_node(scene,"/Main/Child") == child, file+" valid path rejected")
    check(handler.resolve_target({"object_id":child.get_instance_id()}) == child, "owned object id rejected")
    check(handler.resolve_target({"node_path":"/Main/Child"}) == child, "owned path rejected")
    check(not handler.call_method({"node_path":".","method":"get_name"}).has("__error"), "safe native rejected")
    check(handler.call_method({"node_path":".","method":"custom_action"}).has("__error"), "script enabled implicitly")
    var trusted = handler.call_method({"node_path":".","method":"custom_action","trusted_script":true})
    check(trusted.get("result",{}).get("value") == 42, "trusted script rejected")
    check(handler.call_method({"node_path":".","method":"get_tree","trusted_script":true}).has("__error"), "trust enables unlisted native")
    var source = FileAccess.open("res://script_target.gd", FileAccess.WRITE)
    source.store_string("extends Node\n@warning_ignore(\"native_method_override\")\nfunc get_class() -> String:\n\treturn \"SCRIPT_METHOD_EXECUTED\"\n")
    source.close()
    var script_call = handler.call_method({"resource_path":"res://script_target.gd","method":"get_class"})
    check(script_call.get("__error",{}).get("code") == "SAFETY_VIOLATION", "Script resource native-name reflection allowed")
    check(CustomNode.metadata_calls == 0, "Policy executed project static metadata method")
    if failures.is_empty():
        print("REFLECTION_SAFETY_PASS")
    else:
        printerr(JSON.stringify(failures))
    quit(0 if failures.is_empty() else 1)
