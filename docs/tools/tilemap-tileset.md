# TileMapLayer and TileSet atlas power tools

Godot MCP exposes a focused Godot 4.6 power-tools slice for modern `TileMapLayer` editing and embedded `TileSet` / `TileSetAtlasSource` authoring. These tools are intentionally higher level than `node.*` and `object.*`: use them for bounded, Undo/Redo-aware tile workflows and keep the generic surfaces as the fallback for uncommon TileSet features.

This slice is `TileMapLayer`-first. The deprecated `TileMap` node is not given a specialized wrapper; older projects can still use the generic MCP APIs.

## TileMapLayer

| Tool | Purpose |
| --- | --- |
| `tilemap.inspect` | Inspect layer state, TileSet presence, tile size, used-cell count/bounds, and collision/navigation flags. |
| `tilemap.get_cells` | Read snapshot-bound, byte-bounded pages in deterministic row-major order. |
| `tilemap.set_cell` | Set one cell using `source_id`, `atlas_coords`, and `alternative_tile`. |
| `tilemap.set_cells` | Prevalidate up to 4096 cells, apply one Undo/Redo action and verify the applied count. |
| `tilemap.erase_cells` | Prevalidate and erase up to 4096 cells with exact previous-cell restoration on Undo. |
| `tilemap.clear` | Clear a layer containing at most 4096 used cells with exact Undo. |
| `tilemap.map_to_local` | Convert map coordinates to the local pixel-space cell center. |
| `tilemap.local_to_map` | Convert a local pixel-space position to map coordinates. |

Map coordinates are bounded to `-32768..32767` on both axes because that is the range serialized by `TileMapLayer`. Batch mutations reject duplicate cell coordinates and validate the full batch before changing the scene.

### Complete cell enumeration

Use `tilemap.inspect.used_cell_count` when only a count is needed. For cell data, request a page:

```json
{"node_path":"/Main/Ground","limit":128,"max_bytes":229376}
```

The result includes `count` for this page, `total_count` for the selection, `has_more`, `next_cursor`, `snapshot` and `complete`. The conservative serialization budget may reduce the page below `limit`. Repeat with `cursor` set to `next_cursor` and the same `node_path` and `coords` selection until `has_more` is false. Do not treat the first page as the full map.

`limit` is 1..512, `max_bytes` is 16,384..229,376, and a full-layer inspection is bounded to 100,000 cells. Explicit coordinate selections retain their 4,096-coordinate bound. A cursor is bound to the layer instance and inspected cell values. `TILEMAP_CURSOR_STALE` means the scene or selection changed; restart enumeration.

### Write confirmation

`tilemap.set_cells` returns `requestId`, `requested_count`, `applied_count` and `confirmation` (`applied`, `partial` or `unknown`). Applied counts are checked against the layer after the operation. `saved: false` describes an in-memory editor change.

The request envelope is bounded to 8 MiB of encoded JSON and 50,000 native serialization items; native byte accounting is conservative. The 4,096-cell handler limit is an upper bound, so batches can still hit the input budget first. Split a rejected batch into smaller requests. Decoded `value`, `args`, `properties` and `binds` retain their stricter budgets.

Transport errors identify the request and distinguish `executionOutcome: not_applied` when it was never sent or native validation rejected it before dispatch, from `unknown` when a response was lost. Rejections before dispatch report `appliedCount: 0`. Disconnects include `transportCloseCode` and `transportCloseReason` when available. A timeout does not prove that no cells changed. Inspect the layer before retrying; the server does not replay the mutation automatically.

Example:

```json
{
  "tool": "tilemap.set_cells",
  "arguments": {
    "node_path": "/Main/Ground",
    "cells": [
      {"coords":{"x":0,"y":0},"source_id":0,"atlas_coords":{"x":0,"y":0},"alternative_tile":0},
      {"coords":{"x":1,"y":0},"source_id":0,"atlas_coords":{"x":1,"y":0},"alternative_tile":0}
    ]
  }
}
```

## Embedded TileSet and atlas sources

| Tool | Purpose |
| --- | --- |
| `tileset.inspect` | Summarize the TileSet assigned to a `TileMapLayer` and its bounded source list. |
| `tileset.ensure_for_layer` | Create and assign an embedded TileSet if the layer does not already have one. |
| `tileset.add_atlas_source` | Load a project `Texture2D` and add it as a `TileSetAtlasSource`. |
| `tileset.inspect_atlas_source` | Inspect atlas configuration and up to 4096 base tiles. |
| `tileset.create_atlas_tiles` | Atomically create up to 4096 non-overlapping base atlas tiles. |
| `tileset.remove_source` | Remove an unused source while preserving the exact source resource for Undo. |

`tileset.ensure_for_layer` never replaces an existing TileSet. In this phase it creates an embedded TileSet; external `.tres` TileSet lifecycle remains available through the generic resource APIs rather than being hidden inside these helpers.

`tileset.add_atlas_source.texture_path` is a real project filesystem/resource path and therefore participates in project-path security fingerprinting. Node paths, map coordinates, and atlas coordinates are semantic values and are not treated as filesystem paths.

Example:

```json
{
  "tool": "tileset.add_atlas_source",
  "arguments": {
    "node_path": "/Main/Ground",
    "texture_path": "res://tiles.png",
    "texture_region_size": {"x":16,"y":16},
    "source_id": 0
  }
}
```

Then expose atlas cells explicitly:

```json
{
  "tool": "tileset.create_atlas_tiles",
  "arguments": {
    "node_path": "/Main/Ground",
    "source_id": 0,
    "tiles": [
      {"atlas_coords":{"x":0,"y":0}},
      {"atlas_coords":{"x":1,"y":0}}
    ]
  }
}
```

## Undo/Redo and shared resources

Every mutation is recorded in the edited scene's `EditorUndoRedoManager` using the target `TileMapLayer` as the custom context. Batch cell operations are one editor action and restore the exact prior cell identifiers.

A TileSet can be shared by multiple `TileMapLayer` nodes. `tileset.remove_source` recursively checks every layer in the edited scene that references the same TileSet and returns `SOURCE_IN_USE` if any used cell references that source. This prevents a source edit through one layer from silently invalidating another layer.

## Error behavior

Common domain errors include:

- `NODE_NOT_FOUND` — the logical scene path is absent.
- `INVALID_NODE_TYPE` — the requested node is not a `TileMapLayer`.
- `TILESET_NOT_FOUND` — a TileSet-dependent operation was requested before one was assigned.
- `SOURCE_NOT_FOUND` — the source ID is absent.
- `INVALID_SOURCE_TYPE` — a source exists but is not a `TileSetAtlasSource`.
- `TILE_NOT_FOUND` — a requested atlas tile or alternative does not exist.
- `ALREADY_EXISTS` — a source ID or atlas tile would be overwritten.
- `SOURCE_IN_USE` — source removal would invalidate painted cells.
- `LIMIT_EXCEEDED` — an inspection or clear operation exceeds the bounded response/edit limit.
- `INVALID_ARGUMENT` — malformed, duplicate, overlapping, or out-of-range coordinates were supplied.

## Current boundaries

This phase deliberately excludes terrain sets, TileData physics/navigation/custom-data/occlusion layers, scene-collection sources, alternative-tile authoring, external TileSet file management, automatic atlas slicing, procedural map generation, and the broader Sprite2D/Camera2D/CollisionShape2D/Parallax helper set. Those remain separate milestones so this surface stays deterministic and reviewable.
