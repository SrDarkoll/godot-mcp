@tool
extends RefCounted

var _editor_interface

func _init(editor_interface) -> void:
    _editor_interface = editor_interface

func serialize_node(scene_root: Node, node: Node) -> Dictionary:
    var script_path = null
    var script = node.get_script()
    if script is Script and not script.resource_path.is_empty():
        script_path = script.resource_path
    var relative := scene_root.get_path_to(node)
    var logical_path := "/%s" % scene_root.name
    if relative != NodePath("."):
        logical_path += "/%s" % str(relative)
    var children: Array = []
    for child in node.get_children():
        children.append(serialize_node(scene_root, child))
    return {
        "name": node.name,
        "type": node.get_class(),
        "path": logical_path,
        "script": script_path,
        "children": children
    }

func run(_params: Dictionary) -> Dictionary:
    var root: Node = _editor_interface.get_edited_scene_root()
    return {
        "scenePath": root.scene_file_path if root else null,
        "root": serialize_node(root, root) if root else null
    }
