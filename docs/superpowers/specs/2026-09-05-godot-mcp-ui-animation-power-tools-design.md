# Godot MCP UI & Animation Power Tools Design

## Goal

Add high-level, deterministic Godot 4.x editor tools for common UI layout and AnimationPlayer editing tasks while preserving the generic `node.*`, `object.*`, and `resource.*` APIs as fallbacks.

The tools must reduce verbose low-level property editing without embedding agent logic in the MCP server.

## Scope

### UI tools

- `ui.inspect_layout`
- `ui.set_layout_preset`
- `ui.set_anchors`
- `ui.set_offsets`
- `ui.set_size_flags`
- `ui.set_focus_neighbor`

### Animation tools

- `animation.list`
- `animation.inspect`
- `animation.create`
- `animation.remove`
- `animation.configure`
- `animation.add_track`
- `animation.insert_key`
- `animation.remove_key`

Out of scope for this phase:

- Theme resource creation/override management.
- AnimationTree state machines/blend trees.
- Audio-track specialized editing.
- Editor-time animation preview/playback.
- SpriteFrames/AnimatedSprite2D.
- Automatic UI generation or automatic animation authoring.

## Design principles

1. **High-level helpers, generic fallback.** Every operation maps to public Godot editor APIs. Existing generic MCP tools remain available for unsupported properties.
2. **Editor-only mutation.** These tools modify the currently edited scene and its embedded resources. Runtime editing remains under `runtime.*`.
3. **Undo/Redo first.** Every mutation is registered through `EditorUndoRedoManager` when available.
4. **No arbitrary code.** No GDScript snippets, eval, arbitrary method dispatch, or shell execution.
5. **Deterministic inputs.** String enums map to Godot constants inside the addon. Unknown enum names return `INVALID_ARGUMENT`.
6. **Stable logical node paths.** Inputs use the existing logical paths such as `/Main/HUD/Panel`.
7. **Variant reuse.** Animation key values use the existing ergonomic/canonical Variant serializer.
8. **Container awareness.** UI inspection explicitly reports when a direct parent `Container` owns layout so an agent can avoid fighting container-managed offsets.

## UI API

### `ui.inspect_layout`

Input:

```json
{ "node_path": "/Main/HUD/Panel" }
```

The target must inherit `Control`.

Returns:

- logical `node_path`
- Godot class name
- parent class and `container_managed`
- local rect and global rect
- anchors: left/top/right/bottom
- offsets: left/top/right/bottom
- `custom_minimum_size`
- `minimum_size` from `get_combined_minimum_size()`
- horizontal/vertical size flags as normalized names
- `size_flags_stretch_ratio`
- focus neighbors resolved to logical paths when they point at controls in the edited scene

This is read-only.

### `ui.set_layout_preset`

Input fields:

- `node_path`
- `preset`: `top_left | center_top | top_right | center_left | center | center_right | bottom_left | center_bottom | bottom_right | left_wide | top_wide | right_wide | bottom_wide | vcenter_wide | hcenter_wide | full_rect`
- optional `resize_mode`: `min_size | keep_width | keep_height | keep_size`, default `min_size`
- optional integer `margin`, default `0`

Uses `Control.set_anchors_and_offsets_preset()`.

Undo restores all four anchors and offsets exactly.

### `ui.set_anchors`

Input:

```json
{
  "node_path": "/Main/HUD/Panel",
  "left": 0,
  "top": 0,
  "right": 1,
  "bottom": 1,
  "keep_offsets": true
}
```

All anchors are finite numbers. Values outside 0..1 are allowed because Godot permits them. Default `keep_offsets=true`.

The mutation is atomic from the user's perspective and Undo restores all four prior anchors and offsets.

### `ui.set_offsets`

Input contains `node_path` and any subset of `left`, `top`, `right`, `bottom`. At least one side is required.

Returns the resulting complete offset set plus `container_managed` so an agent is warned when a parent Container may rewrite them.

### `ui.set_size_flags`

Input:

```json
{
  "node_path": "/Main/HUD/Button",
  "horizontal": ["fill", "expand"],
  "vertical": ["shrink_center"],
  "stretch_ratio": 1.5
}
```

`horizontal` and `vertical` are optional arrays containing any of:

- `fill`
- `expand`
- `shrink_center`
- `shrink_end`

An empty array represents `SIZE_SHRINK_BEGIN` (`0`). `stretch_ratio` is optional and must be finite and greater than zero.

### `ui.set_focus_neighbor`

Input:

- `node_path`
- `side`: `left | top | right | bottom`
- `neighbor_path`: logical path to another `Control`, or `null`/empty to clear

The addon converts logical paths to a relative `NodePath` using `get_path_to()` so agents do not need to reason about relative UI focus paths.

## Animation API

Animation tools target a node inheriting `AnimationMixer` (including `AnimationPlayer`). A library is addressed by a string; the default library is `""`.

An animation key is represented in responses as:

```json
{
  "library": "",
  "animation": "fade_in",
  "qualified_name": "fade_in"
}
```

For a non-default library `ui`, the qualified name is `ui/fade_in`, matching Godot's mixer naming convention.

### `animation.list`

Input: `player_path`.

Returns each library and the animations it contains, plus the mixer's flattened animation names.

Read-only.

### `animation.inspect`

Input: `player_path`, `animation`, optional `library`.

Returns:

- length
- loop mode as `none | linear | pingpong`
- step
- track count
- each track's index, type, path, enabled state, interpolation type, loop-wrap state
- all keys with index, time, transition, and Variant-encoded value

The response is bounded to 2048 keys total. Above that, return `LIMIT_EXCEEDED` instead of truncating silently.

### `animation.create`

Input:

- `player_path`
- `animation`
- optional `library`, default `""`
- optional `length`, default `1.0`, finite and `>= 0`
- optional `loop_mode`, default `none`
- optional `step`, default `1.0 / 30.0`, finite and `> 0`

Behavior:

- If the requested library does not exist, create an `AnimationLibrary` and attach it to the mixer.
- If the animation already exists, return `ALREADY_EXISTS`; this phase does not silently overwrite animation data.
- Create a new `Animation` and add it to the library.
- Undo removes the animation and, if this call created an otherwise empty library, removes that library too.

### `animation.remove`

Remove a named animation from a library. Undo restores the exact `Animation` resource reference.

The library itself remains, even if it becomes empty.

### `animation.configure`

Input: target plus any subset of `length`, `loop_mode`, `step`. At least one field is required.

Undo restores previous values.

### `animation.add_track`

Input:

- target animation
- `type`: `value | position_3d | rotation_3d | scale_3d | blend_shape | method | bezier | animation`
- `path`: Godot animation track path string
- optional `at_position`, default `-1`
- optional `interpolation`: `nearest | linear | cubic | linear_angle | cubic_angle`
- optional `loop_wrap`, default `true`

The target path is stored as `NodePath` using `Animation.track_set_path()`.

Audio tracks are intentionally excluded from this phase because inserting audio keys needs resource-specific offsets and stream handling.

### `animation.insert_key`

Input:

- target animation
- `track_index`
- `time`, finite and `>= 0`
- `value`, decoded with `VariantSerializer.decode()`
- optional `transition`, finite and `> 0`, default `1.0`

This operation only inserts a new timestamp. If the track already has a key at that time (within Godot's exact key lookup), return `KEY_EXISTS`; agents can explicitly remove/replace rather than receiving hidden overwrite semantics.

Undo removes the key inserted by this operation.

### `animation.remove_key`

Input target animation, `track_index`, and `key_index`.

The addon captures the removed key's time, value, and transition. Undo reinserts the same key.

## Errors

Domain errors use extensible bridge codes already supported by the protocol:

- `NODE_NOT_FOUND`
- `INVALID_NODE_TYPE`
- `ANIMATION_NOT_FOUND`
- `ANIMATION_LIBRARY_NOT_FOUND`
- `TRACK_NOT_FOUND`
- `KEY_NOT_FOUND`
- `KEY_EXISTS`
- `ALREADY_EXISTS`
- `LIMIT_EXCEEDED`
- `INVALID_ARGUMENT`

No expected user error should surface as an internal timeout.

## Security and risk policy

Read-only:

- `ui.inspect_layout`
- `animation.list`
- `animation.inspect`

Normal editor mutations:

- all remaining `ui.*` and `animation.*` tools in this phase

They require `network.local`, `filesystem.project`, and `editor.modify` under the existing policy. No new dangerous permission is introduced.

Animation and UI mutations participate in the same editor mutation gate/transaction barrier as existing node/resource mutations.

## Files and components

Protocol:

- `packages/protocol/src/ui.ts`
- `packages/protocol/src/animation.ts`
- `packages/protocol/src/index.ts`

Server:

- `packages/server/src/tools/ui-tools.ts`
- `packages/server/src/tools/animation-tools.ts`
- `packages/server/src/mcp/register-ui-tools.ts`
- `packages/server/src/mcp/register-animation-tools.ts`
- `packages/server/src/mcp/create-server.ts`
- `packages/server/src/security/tool-policy.ts`

Godot addon:

- `packages/godot-addon/addons/godot_mcp/bridge/handlers/ui_handlers.gd`
- `packages/godot-addon/addons/godot_mcp/bridge/handlers/animation_handlers.gd`
- `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`

Tests:

- protocol schema tests
- server forwarding/registration/policy tests
- live Godot editor integration that creates controls and an AnimationPlayer, mutates them through MCP, saves/reloads, and verifies persistence

## Acceptance criteria

Against real Godot 4.6.3 on Windows:

1. Build, typecheck, and all existing tests stay green.
2. Addon GDScript syntax check stays green.
3. UI layout mutations persist after `scene.save` + `scene.reload`.
4. UI mutations can be undone/redone through the existing editor Undo/Redo tools.
5. Animation creation, track creation, key insertion, configuration and removal persist after save/reload.
6. Animation key values round-trip through the existing Variant system.
7. Invalid Control/AnimationMixer targets return structured domain errors.
8. Existing runtime, visual, recovery, workflow, and security integration suites remain green.
