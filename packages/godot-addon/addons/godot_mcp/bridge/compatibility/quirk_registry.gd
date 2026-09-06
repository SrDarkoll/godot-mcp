@tool
extends RefCounted

const KEEP_Y_VELOCITY_HIDDEN := "navigation.agent3d.keep_y_velocity.hidden_with_3d_avoidance"

var _engine: Dictionary

func _init(engine: Dictionary) -> void:
    _engine = engine

func active(quirk_id: String) -> bool:
    match quirk_id:
        KEEP_Y_VELOCITY_HIDDEN:
            return int(_engine.get("major", 0)) == 4 and int(_engine.get("minor", 0)) >= 6
        _:
            return false

func manifest() -> Dictionary:
    return {
        KEEP_Y_VELOCITY_HIDDEN: {
            "active": active(KEEP_Y_VELOCITY_HIDDEN),
            "reason": "Known Godot 4.6+ NavigationAgent3D property-usage behavior"
        }
    }
