extends RefCounted
var _busy := false
func send_capture(agent: Node, packet: Dictionary) -> Dictionary:
    if _busy:
        return {"__error":{"code":"BUSY","message":"A game capture is already active"}}
    if DisplayServer.get_name()=="headless":
        return {"__error":{"code":"CAPTURE_UNSUPPORTED","message":"Game has no graphical renderer"}}
    _busy = true
    var result: Dictionary = await _capture(agent,packet)
    _busy = false
    return result
func _capture(agent: Node, packet: Dictionary) -> Dictionary:
    var viewport := agent.get_tree().root
    var scene := agent.get_tree().current_scene
    if viewport.size.x>4096 or viewport.size.y>4096:
        return {"__error":{"code":"CAPTURE_TOO_LARGE","message":"Game viewport exceeds image bounds"}}
    var waiter = preload("res://addons/godot_mcp/bridge/handlers/visual_handlers.gd").FrameWait.new()
    waiter.start(agent.get_tree())
    var drawn: bool = await waiter.completed
    if not drawn:
        return {"__error":{"code":"CAPTURE_TIMEOUT","message":"Game render deadline exceeded"}}
    if not is_instance_valid(scene) or scene!=agent.get_tree().current_scene:
        return {"__error":{"code":"CAPTURE_FAILED","message":"Game scene changed during capture"}}
    var image := viewport.get_texture().get_image()
    if image==null or image.is_empty():
        return {"__error":{"code":"CAPTURE_FAILED","message":"Game returned an empty viewport"}}
    image.convert(Image.FORMAT_RGBA8)
    var bytes := image.save_png_to_buffer()
    if bytes.is_empty() or bytes.size()>16*1024*1024:
        return {"__error":{"code":"CAPTURE_TOO_LARGE","message":"Game PNG exceeds byte limit"}}
    var encoded := Marshalls.raw_to_base64(bytes)
    var hashing := HashingContext.new()
    hashing.start(HashingContext.HASH_SHA256)
    hashing.update(bytes)
    var capture_id := str(packet.runId)+"_"+str(packet.requestId)
    var common := {"mcpSessionId":packet.mcpSessionId,"runId":packet.runId,"requestId":packet.requestId,"captureId":capture_id}
    var meta := common.duplicate()
    meta.merge({"width":image.get_width(),"height":image.get_height(),"scene":scene.scene_file_path,"captured_at":Time.get_datetime_string_from_system(true)+"Z","totalBytes":bytes.size(),"totalChunks":int(ceil(encoded.length()/65536.0)),"sha256":hashing.finish().hex_encode()})
    EngineDebugger.send_message("godot_mcp:capture_begin",[meta])
    for index in range(meta.totalChunks):
        var chunk := common.duplicate()
        chunk.merge({"index":index,"data":encoded.substr(index*65536,65536)})
        EngineDebugger.send_message("godot_mcp:capture_chunk",[chunk])
        if index%4==3:
            await agent.get_tree().process_frame
    EngineDebugger.send_message("godot_mcp:capture_end",[common])
    return {}
