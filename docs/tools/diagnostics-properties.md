# Compiler diagnostics and property assignment

## `script.validate`

```json
{"content":"extends Node\n...","path":"res://tools/example.gd"}
```

The optional path supplies source context and the directory for relative dependencies. Validation compiles an in-memory script under a unique resource path; it does not save or replace the source file. On supported Godot builds, the native Logger captures original messages and line numbers. Each error includes `path`, `line`, `column`, `severity` and `message`. Unknown locations, including columns Godot does not supply, are null. `error_code` retains the numeric compilation result, while `diagnostics_available` and `diagnostics_truncated` describe the capture limits.

## `node.set_property`

The setter finds the property metadata and checks its type before creating the Undo action. Safe numeric and StringName/NodePath conversions are supported, as are correctly typed packed-array elements. Resource subclasses must match the property; a failed load is rejected and leaves the existing property intact.

```json
{
  "node_path":"/Main/Sprite",
  "property":"texture",
  "value":{"type":"Resource","value":{"path":"res://assets/imported_texture.png"}}
}
```

Resources must already be imported. For nullable properties, use an explicit JSON null to clear them. A missing `value` is not a clear request.

The result retains `previous_value` and the effective `new_value`, adds `expected_type` and `matches_requested`, and marks `applied: true`, `saved: false`. Some native setters normalize or clamp valid inputs; inspect the effective value. Type failures expose expected and received types with an example where available. Saving the scene remains a separate operation.

## Failed-start logs

Every owned runtime launch reserves a raw boot log inside its session. Godot receives a temporary `--log-file` argument and the original editor run arguments are restored after launch. Compilation errors detected before launch are also retained. The native runtime agent is not required for reading a failed-start boot log.

Diagnostic entries identify native Logger data, scene validation or startup-log parsing with `source`. Startup logs are untrusted mixed output; parsed stderr patterns are diagnostic evidence, not project-test assertions. The editor exposes observed play state rather than an OS exit code, so unavailable exit codes are null.
