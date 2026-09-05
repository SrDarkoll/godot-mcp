extends SceneTree
func _initialize() -> void:
    var script = load("res://addons/godot_mcp/debugger/capture_assembler.gd")
    if script == null:
        quit(1)
        return
    var bytes := PackedByteArray([1,2,3])
    var hashing := HashingContext.new()
    hashing.start(HashingContext.HASH_SHA256)
    hashing.update(bytes)
    var meta := {"captureId":"capture","requestId":"req","runId":"run","width":1,"height":1,"scene":"res://main.tscn","captured_at":"2026-09-05T00:00:00Z","totalChunks":1,"totalBytes":3,"sha256":hashing.finish().hex_encode()}
    var good = script.new()
    assert(good.begin(meta))
    assert(good.push(0,Marshalls.raw_to_base64(bytes)))
    assert(good.finish().get("png_base64") == "AQID")
    var invalid = script.new()
    assert(invalid.begin(meta))
    assert(not invalid.push(1,"AQID"))
    assert(invalid.finish().has("__error"))
    var missing = script.new()
    assert(missing.begin(meta))
    assert(missing.finish().has("__error"))
    var huge := meta.duplicate()
    huge.totalBytes = 16777217
    assert(not script.new().begin(huge))
    var corrupt = script.new()
    assert(corrupt.begin(meta))
    assert(corrupt.push(0,"AAAA"))
    assert(corrupt.finish().has("__error"))
    print("CAPTURE_ASSEMBLER_PASS")
    quit()
