# Editor viewport captures

Plan 3 adds `visual.capture_viewport_2d`, `visual.capture_viewport_3d` and `session.manifest`.
These are standard MCP tools. The first two return a PNG image content block and structured metadata after the image and manifest have been persisted. They use Godot APIs, with no desktop input simulation.

## Examples

2D capture arguments:

```json
{"label":"player_spawn","reason":"after_visual_change","checkpoint":true}
```

3D capture arguments:

```json
{"label":"level_geometry","viewport_index":0,"checkpoint":true}
```

Call `session.manifest` with `{}` to inspect the current session, including when no editor is connected. Defaults for capture: label `capture`, reason `manual_request`, checkpoint `false`; 3D index defaults to `0` and accepts integers 0–3. Labels are limited to 80 characters. Unknown fields and caller-selected output paths are rejected.

Capture activates the corresponding 2D/3D editor tab. It retains the existing camera/zoom, includes whatever Godot draws in that editor SubViewport, and does not save or mutate the scene. An unselected/hidden 3D viewport returns `VIEWPORT_UNAVAILABLE`; an absent scene returns `NO_OPEN_SCENE`. Unsaved scenes can have a null scene path.

The editor must have graphical rendering and the required public viewport API. Headless capture returns `CAPTURE_UNSUPPORTED`. Rendering is requested through `RenderingServer.force_draw(false)` on the main thread so an idle or occluded editor can still supply a new frame. The render deadline is two seconds and bridge RPC deadline is five seconds. Maximum dimensions are 4096 per axis and maximum PNG size is 16 MiB; captures are not silently resized. Some MCP clients have smaller image/message limits.

## Persistent artifacts

```text
.godot-mcp/sessions/<session-id>/
  manifest.json
  screenshots/editor/0001_player_spawn.png
```

Each screenshot records its ID, sequence, relative path, scene, reason, timestamp, dimensions, byte length, SHA-256 and viewport index. A checkpoint with `kind: "visual"` references that screenshot. It does not provide rollback or a recoverable project snapshot. Transaction references remain null until the transaction subsystem exists.

No capture is deleted automatically, including after failures or server restart. Names are exclusive and ordered; failed writes can leave sequence gaps. A PNG written before a failed manifest publication is retained as an unindexed artifact, and the tool returns an error without an image success response. Partially written artifacts are retained as well. There is no automatic cleanup or recovery command in this milestone.

The manifest also retains version metadata, timestamps and controlled visual error records. Tokens and base64 are never stored in it. Graceful shutdown sets `endedAt`; forced termination can leave it null. Restart creates a new session and preserves previous directories.

Reasons: `manual_request`, `after_visual_change`, `after_visual_fix`, `before_major_change`, `after_major_change`, `on_error`. These are explicit caller annotations; automatic runtime/transaction checkpoint triggers and running-game screenshots are future milestones. The earlier design's illustrative `visual.capture_editor_2d/3d` names are superseded by the canonical names above, without aliases.

## Verification

After `npm run build`, configure `GODOT_BIN` with your local Godot 4.x executable. Run `npm run check:godot` and `npm run test:integration` with `REQUIRE_GODOT_INTEGRATION=1`. For actual rendering on Windows set `GODOT_VISUAL_INTEGRATION=1` and run `npm run test:integration:visual`.

The graphical tier does not pass by skipping missing prerequisites. Tests install a separate fixture, control one test editor at a time, preserve all artifacts under `.godot-mcp/visual-test-runs/`, and stop only processes they create. They verify MCP image bytes against disk, decode PNGs with Godot, recognize fixture colors, detect a red-to-blue scene edit, and check persistence after shutdown and restart. A deterministic noisy texture exercises images larger than 64 KiB. The syntax tier checks every addon script with the addon mounted under `res://addons/godot_mcp`.

Validated target for this delivery: Godot 4.6.3 on Windows, OpenGL Compatibility. Other Godot 4.x releases are capability-gated but are not claimed as tested.
