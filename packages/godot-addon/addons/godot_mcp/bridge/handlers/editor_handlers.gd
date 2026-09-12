@tool
extends RefCounted

const SceneScope = preload("res://addons/godot_mcp/bridge/scene_scope.gd")

var _editor_interface

func _init(editor_interface) -> void:
	_editor_interface = editor_interface

func _error(code: String, message: String) -> Dictionary:
	return {
		"__error": {
			"code": code,
			"message": message
		}
	}

func _get_logical_path(scene_root: Node, node: Node) -> String:
	var relative := scene_root.get_path_to(node)
	var logical_path := "/%s" % scene_root.name
	if relative != NodePath("."):
		logical_path += "/%s" % str(relative)
	return logical_path

func _resolve_node(scene_root: Node, path_str: String) -> Node:
	return SceneScope.resolve(scene_root,path_str)

func get_active_scene(_params: Dictionary) -> Dictionary:
	var root: Node = _editor_interface.get_edited_scene_root()
	return {
		"path": root.scene_file_path if root and not root.scene_file_path.is_empty() else null,
		"root_name": root.name if root else null,
		"root_type": root.get_class() if root else null
	}

func get_open_scenes(_params: Dictionary) -> Dictionary:
	var scenes = _editor_interface.get_open_scenes()
	return {
		"scenes": Array(scenes)
	}

func get_selected_nodes(_params: Dictionary) -> Dictionary:
	var selection = _editor_interface.get_selection()
	var root: Node = _editor_interface.get_edited_scene_root()
	var nodes: Array = []
	if selection and root:
		for n in selection.get_selected_nodes():
			nodes.append({
				"name": n.name,
				"type": n.get_class(),
				"path": _get_logical_path(root, n)
			})
	return { "nodes": nodes }

func select_node(params: Dictionary) -> Dictionary:
	var root: Node = _editor_interface.get_edited_scene_root()
	if not root:
		return _error("NO_OPEN_SCENE", "No scene is currently open in the editor")

	var node_path: String = params.get("node_path", "")
	var node: Node = _resolve_node(root, node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	var selection = _editor_interface.get_selection()
	if not selection:
		return _error("EDITOR_ERROR", "Editor selection is not available")

	var additive: bool = params.get("additive", false)
	if not additive:
		selection.clear()

	selection.add_node(node)
	return {
		"node_path": _get_logical_path(root, node),
		"selected": true
	}

func change_scene(params: Dictionary) -> Dictionary:
	var path: String = params.get("path", "")
	if path.is_empty():
		return _error("INVALID_ARGUMENT", "path is required")

	_editor_interface.open_scene_from_path(path)
	return {
		"path": path,
		"switched": true
	}

func undo(_params: Dictionary) -> Dictionary:
	var undo_redo_mgr = _editor_interface.get_editor_undo_redo()
	if not undo_redo_mgr:
		return { "performed": false }

	var root: Node = _editor_interface.get_edited_scene_root()
	var history_id: int = EditorUndoRedoManager.GLOBAL_HISTORY
	if root:
		history_id = undo_redo_mgr.get_object_history_id(root)

	var ur: UndoRedo = undo_redo_mgr.get_history_undo_redo(history_id)
	if ur and ur.has_undo():
		ur.undo()
		return { "performed": true }

	var global_ur: UndoRedo = undo_redo_mgr.get_history_undo_redo(EditorUndoRedoManager.GLOBAL_HISTORY)
	if global_ur and global_ur.has_undo():
		global_ur.undo()
		return { "performed": true }

	return { "performed": false }

func redo(_params: Dictionary) -> Dictionary:
	var undo_redo_mgr = _editor_interface.get_editor_undo_redo()
	if not undo_redo_mgr:
		return { "performed": false }

	var root: Node = _editor_interface.get_edited_scene_root()
	var history_id: int = EditorUndoRedoManager.GLOBAL_HISTORY
	if root:
		history_id = undo_redo_mgr.get_object_history_id(root)

	var ur: UndoRedo = undo_redo_mgr.get_history_undo_redo(history_id)
	if ur and ur.has_redo():
		ur.redo()
		return { "performed": true }

	var global_ur: UndoRedo = undo_redo_mgr.get_history_undo_redo(EditorUndoRedoManager.GLOBAL_HISTORY)
	if global_ur and global_ur.has_redo():
		global_ur.redo()
		return { "performed": true }

	return { "performed": false }

func _serialize_dir(dir, depth: int = 0, budget: Dictionary = {}) -> Dictionary:
	if budget.is_empty():
		budget = {"left":4096, "bytes":1024*1024}
	budget.left -= 1
	if depth > 32 or budget.left < 0 or dir.get_subdir_count() + dir.get_file_count() > budget.left:
		return _error("RESULT_TOO_LARGE", "Filesystem listing exceeds depth/entry limits")
	var subdirs: Array = []
	for i in range(dir.get_subdir_count()):
		var child = _serialize_dir(dir.get_subdir(i), depth + 1, budget)
		if child.has("__error"):
			return child
		subdirs.append(child)
	var files: Array = []
	for i in range(dir.get_file_count()):
		budget.left -= 1
		if budget.left < 0:
			return _error("RESULT_TOO_LARGE", "Filesystem listing exceeds entry limits")
		var entry = {
			"name": dir.get_file(i),
			"path": dir.get_file_path(i),
			"type": dir.get_file_type(i),
			"is_dir": false
		}
		budget.bytes -= JSON.stringify(entry).to_utf8_buffer().size()
		if budget.bytes < 0:
			return _error("RESULT_TOO_LARGE", "Filesystem listing exceeds byte limits")
		files.append(entry)
	var result = {
		"name": dir.get_name(),
		"path": dir.get_path(),
		"is_dir": true,
		"files": files,
		"subdirectories": subdirs
	}
	budget.bytes -= str(dir.get_name()).to_utf8_buffer().size()*6 + str(dir.get_path()).to_utf8_buffer().size()*6 + 128
	if budget.bytes < 0:
		return _error("RESULT_TOO_LARGE", "Filesystem listing exceeds byte limits")
	return result

func get_filesystem(_params: Dictionary) -> Dictionary:
	var efs = _editor_interface.get_resource_filesystem()
	if efs:
		var root_dir = efs.get_filesystem()
		if root_dir:
			var result = _serialize_dir(root_dir)
			return result if result.has("__error") else {"root":result}

	return {
		"root": {
			"name": "res://",
			"path": "res://",
			"is_dir": true,
			"files": [],
			"subdirectories": []
		}
	}

func scan_filesystem(_params: Dictionary) -> Dictionary:
	var efs = _editor_interface.get_resource_filesystem()
	if efs:
		efs.scan()
	return { "scanned": true }
