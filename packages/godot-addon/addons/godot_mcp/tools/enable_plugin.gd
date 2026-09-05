extends SceneTree

const PLUGIN_PATH := "res://addons/godot_mcp/plugin.cfg"

func _init() -> void:
    var enabled: PackedStringArray = ProjectSettings.get_setting("editor_plugins/enabled", PackedStringArray())
    if not enabled.has(PLUGIN_PATH):
        enabled.append(PLUGIN_PATH)
        ProjectSettings.set_setting("editor_plugins/enabled", enabled)
    var save_error := ProjectSettings.save()
    if save_error != OK:
        printerr("GODOT_MCP_PLUGIN_ENABLE_FAILED:%d" % save_error)
        quit(1)
        return
    print("GODOT_MCP_PLUGIN_ENABLED")
    quit(0)
