extends SceneTree
const Serializer = preload("res://addons/godot_mcp/serialization/variant_serializer.gd")
const Dispatcher = preload("res://addons/godot_mcp/bridge/rpc_dispatcher.gd")
const RuntimeHandlers = preload("res://addons/godot_mcp/runtime/runtime_handlers.gd")
const SceneTreeHandler = preload("res://addons/godot_mcp/bridge/handlers/scene_tree.gd")
const EditorHandlers = preload("res://addons/godot_mcp/bridge/handlers/editor_handlers.gd")
class FakeDirectory:
    extends RefCounted
    var child = null
    var file_count = 0
    func get_subdir_count(): return 0 if child == null else 1
    func get_subdir(_index): return child
    func get_file_count(): return file_count
    func get_name(): return "directory"
    func get_path(): return "res://directory"
    func get_file(_index): return "file.gd"
    func get_file_path(_index): return "res://file.gd"
    func get_file_type(_index): return "GDScript"
class FixtureNode:
    extends Node
    var payload = "original"
class FakeEditor:
    extends RefCounted
    var scene: Node
    func get_edited_scene_root():
        return scene
var failures: Array[String] = []
func check(condition: bool, message: String):
    if not condition:
        failures.append(message)
func _init():
    call_deferred("_run")
func _run():
    var big = "x".repeat(300000)
    var result = Serializer.serialize(big)
    check(result.has("__godot_mcp_serialization_error__"), "oversized string accepted")
    # On the old implementation stop before exercising its unbounded recursion.
    if not result.has("__godot_mcp_serialization_error__"):
        printerr(JSON.stringify(failures))
        quit(1)
        return
    var cycle: Array = []
    cycle.append(cycle)
    check(Serializer.serialize(cycle).has("__godot_mcp_serialization_error__"), "cycle accepted")
    check(Serializer.encode(cycle).has("__godot_mcp_serialization_error__"), "encode cycle accepted")
    check(Serializer.decode(cycle).has("__godot_mcp_serialization_error__"), "decode cycle accepted")
    check(Serializer.deserialize(cycle).has("__godot_mcp_serialization_error__"), "deserialize cycle accepted")
    cycle.clear()
    var deep: Array = []
    for i in range(40):
        deep = [deep]
    check(Serializer.encode(deep).has("__godot_mcp_serialization_error__"), "depth accepted")
    var wide: Array = []
    wide.resize(5000)
    check(Serializer.serialize(wide).has("__godot_mcp_serialization_error__"), "width accepted")
    var shared: Array = [1, 2]
    check(not Serializer.serialize([shared, shared]).has("__godot_mcp_serialization_error__"), "shared reference mistaken for cycle")
    check(Serializer.deserialize(Serializer.serialize(Vector2(2, 3))) == Vector2(2, 3), "typed round trip changed")
    check(Serializer.encode({"ok": [1, true, "text"]}) == {"ok": [1, true, "text"]}, "ordinary encoding changed")
    var scene = FixtureNode.new()
    scene.name = "Main"
    root.add_child(scene)
    var editor = FakeEditor.new()
    editor.scene = scene
    var dispatcher = Dispatcher.new(editor)
    var rejected = await dispatcher.dispatch(JSON.stringify({"id":"input", "protocol":1, "method":"object.set", "params":{"node_path":".", "property":"payload", "value":big}}))
    check(rejected.get("error",{}).get("code") == "ARGUMENT_TOO_LARGE", "oversized input not rejected")
    check(scene.payload == "original", "oversized input mutated scene")
    scene.payload = big
    var output = await dispatcher.dispatch(JSON.stringify({"id":"output", "protocol":1, "method":"object.get", "params":{"node_path":".", "property":"payload"}}))
    check(output.get("error",{}).get("code") == "RESULT_TOO_LARGE", "nested serialization failure returned success")
    var runtime = RuntimeHandlers.new(self, Node.new())
    var runtime_result = runtime.run("runtime.get_property", {"node_path":"/root/Main", "property":"payload"})
    check(runtime_result.get("__error",{}).get("code") == "RESULT_TOO_LARGE", "runtime budget bypassed")
    runtime.agent.free()
    var parent: Node = scene
    for i in range(40):
        var child = Node.new()
        child.name = "Nested"
        parent.add_child(child)
        parent = child
    var tree_response = SceneTreeHandler.new(editor).run({})
    check(tree_response.get("__error",{}).get("code") == "RESULT_TOO_LARGE", "scene tree expanded past depth budget")
    var directory = FakeDirectory.new()
    for i in range(40):
        var wrapper = FakeDirectory.new()
        wrapper.child = directory
        directory = wrapper
    var editor_handlers = EditorHandlers.new(editor)
    check(editor_handlers._serialize_dir(directory).get("__error",{}).get("code") == "RESULT_TOO_LARGE", "filesystem traversal depth unbounded")
    directory = FakeDirectory.new()
    directory.file_count = 5000
    check(editor_handlers._serialize_dir(directory).get("__error",{}).get("code") == "RESULT_TOO_LARGE", "filesystem traversal size unbounded")
    if failures.is_empty():
        print("SERIALIZATION_BUDGET_PASS")
    else:
        printerr(JSON.stringify(failures))
    quit(0 if failures.is_empty() else 1)
