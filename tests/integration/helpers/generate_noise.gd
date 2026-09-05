extends SceneTree

func _initialize() -> void:
    var random := RandomNumberGenerator.new()
    random.seed = 123456
    var pixels := PackedByteArray()
    pixels.resize(512 * 512 * 3)
    for index in range(pixels.size()):
        pixels[index] = random.randi_range(0, 255)
    var image := Image.create_from_data(512, 512, false, Image.FORMAT_RGB8, pixels)
    quit(0 if image.save_png("res://noise.png") == OK else 1)
