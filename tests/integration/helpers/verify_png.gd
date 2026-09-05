extends SceneTree

func _initialize() -> void:
    var results: Array = []
    for file in OS.get_cmdline_user_args():
        var image := Image.new()
        if image.load(file) != OK:
            quit(1)
            return
        var counts := {"red": 0, "green": 0, "blue": 0, "width": image.get_width(), "height": image.get_height()}
        for y in range(image.get_height()):
            for x in range(image.get_width()):
                var color := image.get_pixel(x, y)
                if color.r > 0.8 and color.g < 0.2 and color.b < 0.2:
                    counts.red += 1
                if color.g > 0.8 and color.r < 0.2 and color.b < 0.2:
                    counts.green += 1
                if color.b > 0.8 and color.r < 0.2 and color.g < 0.2:
                    counts.blue += 1
        results.append(counts)
    print("PNG_STATS=" + JSON.stringify(results))
    quit(0)
