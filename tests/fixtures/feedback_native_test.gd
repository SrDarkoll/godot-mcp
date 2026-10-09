extends SceneTree

class TestEditor extends RefCounted:
    var scene: Node
    func _init(root: Node): scene = root
    func get_edited_scene_root(): return scene
    func get_editor_undo_redo(): return null

var failures: Array[String] = []
var checks := 0

func check(condition: bool, message: String) -> void:
    checks += 1
    if not condition: failures.append(message)

func _init() -> void:
    call_deferred("run_tests")

func run_tests() -> void:
    var root_node := Node2D.new()
    root_node.name = "Feedback"
    root.add_child(root_node)
    var editor := TestEditor.new(root_node)
    var scripts = load("res://addons/godot_mcp/bridge/handlers/script_handlers.gd").new(editor)
    var invalid = scripts.validate({"content":"extends Node2D\n\nfunc _build(name) -> void:\n    var title := \"Palm\"\n    var palm := \"Palm\" in name\n    print(title, palm)\n", "path":"res://inference.gd"})
    check(invalid.valid == false, "invalid inference must fail")
    check(invalid.errors[0].line == 5, "compiler must report the real line")
    check(str(invalid.errors[0].message).contains("Cannot infer"), "compiler must preserve the original explanation")
    check(invalid.errors[0].get("path") == "res://inference.gd", "compiler must preserve the caller's source path")
    check(invalid.errors[0].get("column") == null, "unknown compiler columns must remain unknown")
    check(invalid.get("error_code") == 43, "compiler numeric code must remain available")
    var corrected = scripts.validate({"content":"extends Node2D\nfunc _build(name) -> void:\n    var palm: bool = \"Palm\" in str(name)\n    print(palm)\n", "path":"res://inference.gd"})
    check(corrected.valid == true, "corrected inference must compile")
    var syntax = scripts.validate({"content":"extends Node\n\nfunc test() -> void:\n    var broken = [\n", "path":"res://syntax.gd"})
    check(syntax.valid == false and syntax.errors[0].line >= 4, "syntax error location must be useful")
    var dependency = scripts.validate({"content":"extends Node\n\nconst Missing = preload(\"res://missing_dependency.gd\")\n", "path":"res://dependency.gd"})
    check(dependency.valid == false and dependency.errors.size() > 0, "missing dependency must report diagnostics")

    var layer := TileMapLayer.new()
    layer.name = "Ground"
    var tileset := TileSet.new()
    tileset.tile_size = Vector2i(16,16)
    var atlas := TileSetAtlasSource.new()
    var placeholder := PlaceholderTexture2D.new()
    placeholder.size = Vector2(16,16)
    atlas.texture = placeholder
    atlas.texture_region_size = Vector2i(16,16)
    atlas.create_tile(Vector2i.ZERO)
    tileset.add_source(atlas,0)
    layer.tile_set = tileset
    root_node.add_child(layer)
    for index in range(1907): layer.set_cell(Vector2i(index % 64,index / 64),0,Vector2i.ZERO,0)
    var tilemaps = load("res://addons/godot_mcp/bridge/handlers/tilemap_handlers.gd").new(editor)
    var seen: Dictionary = {}
    var cursor = null
    var pages := 0
    while true:
        var args := {"node_path":"/Feedback/Ground","limit":128}
        if cursor != null: args.cursor = cursor
        var page: Dictionary = tilemaps.get_cells(args)
        check(not page.has("__error"), "tile page must succeed")
        if page.has("__error"): break
        var issue = load("res://addons/godot_mcp/serialization/serialization_budget.gd").check(page)
        check(str(issue).is_empty(), "page must fit the real serialization budget")
        check(page.get("total_count") == 1907, "page must expose the full count")
        check(page.get("count") == page.cells.size(), "page count must match returned entries")
        for cell in page.cells:
            var key := str(cell.coords.x)+":"+str(cell.coords.y)
            check(not seen.has(key), "pages must not duplicate coordinates")
            seen[key] = true
        pages += 1
        if not page.get("has_more",false):
            check(page.get("next_cursor") == null, "finished enumeration must clear its cursor")
            break
        cursor = page.next_cursor
        if pages > 100: failures.append("pagination did not finish"); break
    check(seen.size() == 1907, "pagination must enumerate all 1907 cells")
    check(pages > 1, "large results must use several pages")
    var first = tilemaps.get_cells({"node_path":"/Feedback/Ground","limit":2})
    if first.has("next_cursor") and first.next_cursor != null:
        layer.set_cell(Vector2i(0,0),0,Vector2i.ZERO,1)
        var changed = tilemaps.get_cells({"node_path":"/Feedback/Ground","cursor":first.next_cursor})
        check(changed.get("__error",{}).get("code") == "TILEMAP_CURSOR_STALE", "changed map must reject the old cursor")
    var selected = tilemaps.get_cells({"node_path":"/Feedback/Ground","coords":[{"x":2,"y":0},{"x":1,"y":0}]})
    check(selected.count == 2 and not selected.get("has_more",false), "coordinate inspection must remain available")
    layer.clear()
    var empty = tilemaps.get_cells({"node_path":"/Feedback/Ground"})
    check(empty.count == 0 and not empty.get("has_more",false), "empty layer must be a complete empty result")
    for batch_size in [128,512,1285]:
        layer.clear()
        var edits: Array = []
        for index in range(batch_size):
            edits.append({"coords":{"x":index % 64,"y":int(index / 64)},"source_id":0,"atlas_coords":{"x":0,"y":0},"alternative_tile":0})
        var written = tilemaps.set_cells({"node_path":"/Feedback/Ground","cells":edits})
        check(not written.has("__error"), "bulk write must apply in the isolated fixture")
        check(written.get("applied_count") == batch_size and written.get("confirmation") == "applied", "bulk write acknowledgement must match readback")
        check(layer.get_used_cells().size() == batch_size, "bulk write count must match the actual layer")

    var sprite := Sprite2D.new()
    sprite.name = "Sprite"
    root_node.add_child(sprite)
    var nodes = load("res://addons/godot_mcp/bridge/handlers/node_handlers.gd").new(editor)
    var wrong = nodes.set_property({"node_path":"/Feedback/Sprite","property":"position","value":"bad vector"})
    check(wrong.get("__error",{}).get("code") == "PROPERTY_TYPE_MISMATCH", "wrong property type must be rejected")
    check(sprite.position == Vector2.ZERO, "wrong setter must leave the property intact")
    var valid = nodes.set_property({"node_path":"/Feedback/Sprite","property":"position","value":{"type":"Vector2","value":{"x":12,"y":34}}})
    check(not valid.has("__error") and sprite.position == Vector2(12,34), "typed vector must roundtrip")
    check(valid.get("saved") == false, "setter must distinguish memory from a saved scene")
    var missing = nodes.set_property({"node_path":"/Feedback/Sprite","property":"missing_property","value":1})
    check(missing.get("__error",{}).get("code") == "PROPERTY_NOT_FOUND", "unknown properties must fail")
    var gradient := GradientTexture2D.new()
    gradient.gradient = Gradient.new()
    check(ResourceSaver.save(gradient,"res://texture.tres") == OK, "texture fixture must save")
    var texture = nodes.set_property({"node_path":"/Feedback/Sprite","property":"texture","value":{"type":"Resource","value":{"path":"res://texture.tres"}}})
    check(not texture.has("__error") and sprite.texture != null and sprite.texture.resource_path == "res://texture.tres", "typed Resource must retain its path")
    var bad_resource = nodes.set_property({"node_path":"/Feedback/Sprite","property":"texture","value":{"type":"Resource","value":{"path":"res://missing.tres"}}})
    check(bad_resource.has("__error") and sprite.texture != null, "failed resource loads must not clear a property")
    check(ResourceSaver.save(Gradient.new(),"res://wrong_class.tres") == OK, "wrong-class resource fixture must save")
    var wrong_class = nodes.set_property({"node_path":"/Feedback/Sprite","property":"texture","value":{"type":"Resource","value":{"path":"res://wrong_class.tres"}}})
    check(wrong_class.get("__error",{}).get("code") == "PROPERTY_TYPE_MISMATCH" and sprite.texture.resource_path == "res://texture.tres", "incompatible Resource classes must preserve the previous texture")
    var cleared = nodes.set_property({"node_path":"/Feedback/Sprite","property":"texture","value":null})
    check(not cleared.has("__error") and sprite.texture == null, "explicit null must clear a nullable resource")
    var values_script := GDScript.new()
    values_script.source_code = "extends Node2D\nvar samples: PackedFloat32Array = PackedFloat32Array()\n"
    check(values_script.reload() == OK, "packed-array fixture must compile")
    root_node.set_script(values_script)
    var samples = nodes.set_property({"node_path":"/Feedback","property":"samples","value":[1.25,2.5]})
    check(not samples.has("__error") and root_node.get("samples") == PackedFloat32Array([1.25,2.5]), "safe packed-array conversion must roundtrip")
    var overflow = nodes.set_property({"node_path":"/Feedback","property":"samples","value":[1.0e40]})
    check(overflow.has("__error") and root_node.get("samples") == PackedFloat32Array([1.25,2.5]), "packed-array conversion overflow must not mutate the property")
    print("MCP_FEEDBACK_NATIVE " + JSON.stringify({"checks":checks,"failures":failures,"pages":pages,"enumerated":seen.size()}))
    root_node.queue_free()
    quit(0 if failures.is_empty() else 1)
