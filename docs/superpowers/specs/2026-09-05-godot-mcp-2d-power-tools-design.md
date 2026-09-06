# Godot MCP 2D Power Tools Design

## Goal

Add a focused Godot 4.x 2D editing layer on top of the existing generic `node.*`, `object.*`, and `resource.*` fallbacks so an MCP client can configure common 2D gameplay nodes in one safe call with editor Undo/Redo.

## Scope

Phase 2B adds 11 tools:

### Node2D
- `node2d.inspect_transform`
- `node2d.set_transform`

### Sprite2D
- `sprite2d.inspect`
- `sprite2d.set_texture`
- `sprite2d.configure`

### Camera2D
- `camera2d.inspect`
- `camera2d.configure`

### CollisionShape2D
- `collision2d.inspect`
- `collision2d.set_shape`

### Parallax2D
- `parallax2d.inspect`
- `parallax2d.configure`

Out of scope:
- AnimatedSprite2D / SpriteFrames authoring
- Polygon/capsule decomposition helpers beyond RectangleShape2D, CircleShape2D, CapsuleShape2D
- collision layers/masks and PhysicsBody2D motion
- Camera2D runtime preview/control
- ParallaxLayer legacy authoring
- CanvasItem material/shader helpers
- Navigation2D
- 3D tooling

## Design principles

- Godot 4.x only; real gate targets Godot 4.6.3.
- Specialized tools compose with existing generic tools rather than replacing them.
- Read tools never mutate editor state.
- Every mutation is one editor Undo/Redo action tied to the edited node as custom context.
- Partial configure tools validate the entire requested state before committing the mutation.
- Filesystem paths remain project-scoped and fingerprinted by ToolPolicy.
- Semantic node paths are never interpreted as filesystem paths.
- JSON-visible floats must be finite.
- Tool outputs return the complete canonical state after mutation.

## Protocol primitives

Reusable JSON schemas:
- `Vector2`: `{x:number,y:number}` finite.
- `Rect2`: `{x:number,y:number,width:number,height:number}` finite; width/height nonnegative.
- scale: finite `Vector2`; zero and negative components remain allowed because Godot permits them, although negative scale decomposition has engine caveats.
- degrees are used for human-facing rotation/skew inputs and outputs.

## Node2D

### `node2d.inspect_transform`
Input: `node_path`.

Requires a Node2D and returns:
- logical node path and runtime class
- local `position`
- local `rotation_degrees`
- local `scale`
- local `skew_degrees`
- global `position`, `rotation_degrees`, and `scale`

### `node2d.set_transform`
Input: `node_path` plus one or more of:
- `position`
- `rotation_degrees`
- `scale`
- `skew_degrees`

Only local transform components are authored. Global transform remains available through generic object/node fallbacks for advanced cases. Undo restores all local transform components exactly, not only the fields supplied.

## Sprite2D

### `sprite2d.inspect`
Returns:
- texture resource path when external, otherwise empty string
- centered, offset, flip_h, flip_v
- hframes, vframes, frame, frame_coords
- region_enabled, region_rect, region_filter_clip_enabled

### `sprite2d.set_texture`
Input: `node_path`, `texture_path` nullable.
- `null` or empty string clears the texture.
- non-empty path must resolve to project-scoped `res://` Texture2D.
- wrong resource type returns `INVALID_RESOURCE_TYPE`.
- missing texture returns `RESOURCE_NOT_FOUND`.
- Undo restores the exact previous Texture2D resource.

`texture_path` is a filesystem path for security policy fingerprinting.

### `sprite2d.configure`
Partial atomic configuration of:
- centered
- offset
- flip_h / flip_v
- hframes / vframes (1..4096)
- frame OR frame_coords (not both)
- region_enabled
- region_rect
- region_filter_clip_enabled

The handler computes prospective hframes/vframes before validating frame/frame_coords. `frame` must be below `hframes * vframes`; `frame_coords` must fit the prospective grid.

Undo restores every Sprite2D layout/frame/region property touched by this tool as one snapshot.

## Camera2D

### `camera2d.inspect`
Returns persistent editor properties:
- enabled
- zoom and offset
- ignore_rotation
- limit_enabled, limit_smoothed, left/top/right/bottom
- position_smoothing_enabled / speed
- rotation_smoothing_enabled / speed
- drag_horizontal_enabled / vertical_enabled
- drag margins left/top/right/bottom

### `camera2d.configure`
Partial atomic update of the above properties.
Validation:
- zoom components must be strictly positive.
- smoothing speeds must be nonnegative finite values.
- drag margins are in `[0,1]`.
- limits are safe integers in signed 32-bit range.
- if multiple limits are supplied, prospective left <= right and top <= bottom.

This tool does not call `make_current()` because current-camera state is viewport/runtime state rather than persistent scene authoring.

## CollisionShape2D

### `collision2d.inspect`
Returns:
- shape kind: `none`, `rectangle`, `circle`, `capsule`, or `other`
- resource path
- supported dimensions for the known shapes
- disabled, one_way_collision, one_way_collision_margin

Unknown Shape2D subclasses are inspectable as `other` but not authored by the specialized tool.

### `collision2d.set_shape`
Input `shape` is one of:
- `{kind:"rectangle", size:{x>0,y>0}}`
- `{kind:"circle", radius>0}`
- `{kind:"capsule", radius>0, height>0}` with `height >= 2 * radius`
- `null` to clear

A fresh embedded resource is created for authored shapes. Undo restores the exact previous Shape2D object. We deliberately validate capsule geometry before assignment rather than relying on Godot's automatic clamping.

This phase does not author `disabled` because Godot documents that property as requiring deferred changes during physics processing; generic object tools remain available for advanced users.

## Parallax2D

### `parallax2d.inspect`
Returns:
- repeat_size
- repeat_times
- scroll_scale
- autoscroll
- scroll_offset
- screen_offset
- follow_viewport
- limit_begin / limit_end

### `parallax2d.configure`
Partial atomic update of the above.
Validation:
- repeat_size components >= 0
- repeat_times >= 1 and <= 1024
- limit vectors finite; prospective begin <= end on both axes
- all other vectors finite

Undo restores the complete specialized Parallax2D snapshot.

## Errors

Standard bridge errors:
- `NODE_NOT_FOUND`
- `INVALID_NODE_TYPE`
- `RESOURCE_NOT_FOUND`
- `INVALID_RESOURCE_TYPE`
- `INVALID_ARGUMENT`

MCP schema validation handles numeric bounds and mutually exclusive fields where possible before RPC.

## Security and risk

Read-only:
- all five inspect tools

Normal editor mutations:
- `node2d.set_transform`
- `sprite2d.set_texture`
- `sprite2d.configure`
- `camera2d.configure`
- `collision2d.set_shape`
- `parallax2d.configure`

No new permission class is introduced.

Only `sprite2d.set_texture.texture_path` is treated as a filesystem path. `node_path` values remain semantic editor paths.

## E2E acceptance

A real Godot 4.6.3 integration test creates:

```text
Main: Node2D
├── Actor: Node2D
│   └── Sprite: Sprite2D
├── Camera: Camera2D
├── Body: StaticBody2D
│   └── Collider: CollisionShape2D
└── Background: Parallax2D
```

The fixture includes a small imported PNG.

The test must:
1. mutate and inspect Actor transform;
2. set Sprite texture and configure frames/region/flip/offset;
3. configure camera zoom, limits, smoothing and drag;
4. create rectangle, circle, capsule and clear collision shapes with Undo/Redo around at least one replacement;
5. configure Parallax2D repeat/scroll/autoscroll/limits;
6. save and reload;
7. verify persistent canonical state;
8. exercise wrong-node-type, missing texture, invalid sprite frame/grid, invalid capsule, and invalid camera limit/zoom guards;
9. confirm the existing generic/runtime/visual suites remain unaffected.
