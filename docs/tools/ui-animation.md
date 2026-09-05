# UI and Animation power tools

Godot MCP exposes specialized helpers for common `Control` layout and `AnimationMixer` editing tasks. These tools sit above the generic `node.*` and `object.*` surfaces: use the specialized tools for compact, Godot-aware edits and fall back to the generic APIs when a property or resource is outside this first power-tools slice.

## UI / Control

All UI mutations participate in the editor Undo/Redo history for the edited scene. `ui.inspect_layout` is read-only.

| Tool | Purpose |
| --- | --- |
| `ui.inspect_layout` | Inspect rects, anchors, offsets, minimum sizes, size flags, focus neighbors and whether a parent `Container` owns layout. |
| `ui.set_layout_preset` | Apply a Godot layout preset such as `center` or `full_rect`. |
| `ui.set_anchors` | Set all four anchors atomically, optionally preserving offsets. |
| `ui.set_offsets` | Set any subset of left/top/right/bottom offsets. |
| `ui.set_size_flags` | Set horizontal/vertical size flags and optional stretch ratio. |
| `ui.set_focus_neighbor` | Set a focus neighbor from a logical scene path, or clear it with `null`. |

Supported layout presets are `top_left`, `center_top`, `top_right`, `center_left`, `center`, `center_right`, `bottom_left`, `center_bottom`, `bottom_right`, `left_wide`, `top_wide`, `right_wide`, `bottom_wide`, `vcenter_wide`, `hcenter_wide`, and `full_rect`.

Supported resize modes are `min_size`, `keep_width`, `keep_height`, and `keep_size`. Size flags are `fill`, `expand`, `shrink_center`, and `shrink_end`; an empty array represents shrink-begin (`0`).

Example:

```json
{
  "tool": "ui.set_size_flags",
  "arguments": {
    "node_path": "/Main/HUD/Menu/PlayButton",
    "horizontal": ["fill", "expand"],
    "vertical": ["shrink_center"],
    "stretch_ratio": 2
  }
}
```

A child whose parent is a `Container` is reported with `container_managed: true`. The tool still changes the requested Control properties, but callers should treat the container as the authority for the child rectangle.

## AnimationMixer / AnimationPlayer

The animation tools target any node inheriting `AnimationMixer`, including `AnimationPlayer`. The optional `library` argument defaults to the global library (`""`). Mutations use the edited scene's Undo/Redo history.

| Tool | Purpose |
| --- | --- |
| `animation.list` | List libraries and animation names. |
| `animation.inspect` | Inspect animation settings, tracks and bounded key data. |
| `animation.create` | Create a new animation and, if needed, its library. |
| `animation.remove` | Remove an animation while preserving its exact resource for Undo. |
| `animation.configure` | Change length, loop mode, or step. |
| `animation.add_track` | Add a supported non-audio track and configure path/interpolation. |
| `animation.insert_key` | Insert a key at an unused exact timestamp. |
| `animation.remove_key` | Remove a key by track/key index. |

Editable track types in this phase are `value`, `position_3d`, `rotation_3d`, `scale_3d`, `blend_shape`, `method`, `bezier`, and `animation`. Existing `audio` tracks are visible through `animation.inspect`, but audio-track authoring is intentionally outside this phase.

Interpolation modes are `nearest`, `linear`, `cubic`, `linear_angle`, and `cubic_angle`. Loop modes are `none`, `linear`, and `pingpong`.

Key values use the same canonical Variant representation as the generic MCP surface. For example, a float key is:

```json
{
  "tool": "animation.insert_key",
  "arguments": {
    "player_path": "/Main/AnimationPlayer",
    "animation": "fade",
    "track_index": 0,
    "time": 0.5,
    "value": {"type": "float", "value": 1.0}
  }
}
```

`animation.inspect` refuses to expand animations with more than 2048 total keys and returns `LIMIT_EXCEEDED`. This keeps MCP responses bounded while leaving generic resource access available for unusual workflows.

## Error behavior

Common domain errors include:

- `NODE_NOT_FOUND` — the logical scene path does not resolve.
- `INVALID_NODE_TYPE` — a UI tool did not receive a `Control`, or an animation tool did not receive an `AnimationMixer`.
- `ANIMATION_LIBRARY_NOT_FOUND` / `ANIMATION_NOT_FOUND` — the requested resource is absent.
- `ALREADY_EXISTS` — `animation.create` would overwrite an existing animation.
- `TRACK_NOT_FOUND` / `KEY_NOT_FOUND` — an index is outside the current animation.
- `KEY_EXISTS` — an exact key timestamp is already occupied.
- `LIMIT_EXCEEDED` — inspection would return too many keys.

## Current boundaries

This first power-tools slice does not add theme-override authoring, `AnimationTree` graph editing, audio-track authoring, playback/preview controls, or `SpriteFrames` helpers. Those remain separate subsystems rather than being hidden behind generic or unsafe calls.
