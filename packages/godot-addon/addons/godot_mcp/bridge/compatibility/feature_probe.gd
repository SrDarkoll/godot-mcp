@tool
extends RefCounted

var _editor_interface

func _init(editor_interface) -> void:
    _editor_interface = editor_interface

func class_exists(class_name: String) -> bool:
    return ClassDB.class_exists(class_name)

func class_has_method(class_name: String, method_name: String) -> bool:
    return ClassDB.class_exists(class_name) and ClassDB.class_has_method(class_name, method_name)

func class_has_property(class_name: String, property_name: String) -> bool:
    if not ClassDB.class_exists(class_name):
        return false
    for property_info in ClassDB.class_get_property_list(class_name):
        if str(property_info.get("name", "")) == property_name:
            return true
    return false

func editor_has_method(method_name: String) -> bool:
    return _editor_interface != null and _editor_interface.has_method(method_name)

func is_headless() -> bool:
    return DisplayServer.get_name() == "headless"
