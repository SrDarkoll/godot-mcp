extends Node2D
var counter := 0
func _ready() -> void:
    position = Vector2(12,24)
    $Color.color = Color.BLUE
    print("RUNTIME_OUTPUT")
    push_warning("RUNTIME_WARNING")
    push_error("RUNTIME_ERROR")
func _process(_delta: float) -> void:
    counter += 1
