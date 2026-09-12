/** Runs after import, without EditorPlugin activation in this worker process. */
export const VALIDATION_SCRIPT = String.raw`extends SceneTree
func _init():
    var args = OS.get_cmdline_user_args()
    if args.size() != 1:
        quit(2)
        return
    var request = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
    if not request is Dictionary:
        quit(2)
        return
    var results: Array = []
    var all_valid = true
    for value in request.paths:
        var path_value = str(value)
        var extension = path_value.get_extension().to_lower()
        var valid = false
        var message = "Resource loading failed"
        if not FileAccess.file_exists(path_value):
            message = "File not found"
        elif extension == "gd":
            var script: GDScript = ResourceLoader.load(path_value, "GDScript", ResourceLoader.CACHE_MODE_IGNORE) as GDScript
            valid = script != null and script.reload() == OK
            message = "GDScript compilation failed"
        elif extension == "tscn" or extension == "tres":
            var resource = ResourceLoader.load(path_value, "", ResourceLoader.CACHE_MODE_IGNORE)
            valid = resource != null and (extension != "tscn" or resource is PackedScene)
        elif extension == "json":
            var parser = JSON.new()
            valid = parser.parse(FileAccess.get_file_as_string(path_value)) == OK
            message = parser.get_error_message()
        results.append({"path":path_value,"valid":valid,"message":"" if valid else message})
        all_valid = all_valid and valid
    var output = FileAccess.open(request.report, FileAccess.WRITE)
    if output == null:
        quit(2)
        return
    output.store_string(JSON.stringify({"files":results,"valid":all_valid}))
    output.flush()
    quit(0 if all_valid else 1)
`;
