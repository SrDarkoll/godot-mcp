@tool
extends RefCounted

var _editor_interface

func _init(editor_interface) -> void:
    _editor_interface = editor_interface

func class_exists(class_name: String) -> bool:
    return ClassDB.class_exists(class_name)

func class_can_instantiate(class_name: String) -> bool:
    return ClassDB.class_exists(class_name) and ClassDB.can_instantiate(class_name)

func class_has_method(class_name: String, method_name: String) -> bool:
    return ClassDB.class_exists(class_name) and ClassDB.class_has_method(class_name, method_name)

func class_has_property(class_name: String, property_name: String) -> bool:
    if not ClassDB.class_exists(class_name):
        return false
    for property_info in ClassDB.class_get_property_list(class_name):
        if str(property_info.get("name", "")) == property_name:
            return true
    return false

func property_has_storage_with_overrides(class_name: String, property_name: String, overrides: Dictionary) -> bool:
    if not class_can_instantiate(class_name) or not class_has_property(class_name, property_name):
        return false
    var instance = ClassDB.instantiate(class_name)
    if instance == null:
        return false
    for key in overrides.keys():
        var override_name := str(key)
        if class_has_property(class_name, override_name):
            instance.set(override_name, overrides[key])
    var has_storage := false
    for property_info in instance.get_property_list():
        if str(property_info.get("name", "")) == property_name:
            has_storage = (int(property_info.get("usage", 0)) & PROPERTY_USAGE_STORAGE) != 0
            break
    instance.free()
    return has_storage

func editor_has_method(method_name: String) -> bool:
    return _editor_interface != null and _editor_interface.has_method(method_name)

func is_headless() -> bool:
    return DisplayServer.get_name() == "headless"
