# Godot MCP TileMapLayer & TileSet Atlas Power Tools Design

## Goal

Add deterministic, high-level Godot 4.x editor tools for modern `TileMapLayer` cell editing and embedded `TileSet`/`TileSetAtlasSource` authoring while preserving the generic `node.*`, `object.*`, and `resource.*` APIs as fallbacks.

The tools should let an agent build and edit practical 2D tile maps in a small number of MCP calls without embedding game-design logic inside the server.

## Scope

### TileMapLayer tools

- `tilemap.inspect`
- `tilemap.get_cells`
- `tilemap.set_cell`
- `tilemap.set_cells`
- `tilemap.erase_cells`
- `tilemap.clear`
- `tilemap.map_to_local`
- `tilemap.local_to_map`

### TileSet / atlas tools

- `tileset.inspect`
- `tileset.ensure_for_layer`
- `tileset.add_atlas_source`
- `tileset.inspect_atlas_source`
- `tileset.create_atlas_tiles`
- `tileset.remove_source`

Out of scope for this phase:

- Deprecated `TileMap` specialized tools. Legacy projects keep generic `node.*`/`object.*` fallback.
- Terrain sets and terrain painting.
- TileSet physics, navigation, occlusion, custom-data, and terrain layers.
- `TileSetScenesCollectionSource` and scene tiles.
- Alternative-tile authoring/editing beyond accepting an existing `alternative_tile` ID when painting cells.
- External `.tres` TileSet creation/ownership workflows. `tileset.ensure_for_layer` creates an embedded TileSet only.
- Sprite2D, Camera2D, CollisionShape2D, Parallax, and other Phase 2B helpers.
- Automatic map generation, procedural layout, or game-design decisions.

## Godot 4.6 compatibility rules

1. Specialized map editing targets `TileMapLayer`, not deprecated `TileMap`.
2. TileMapLayer X/Y map coordinates must be integers in `-32768..32767`, matching Godot's serialized 16-bit coordinate range.
3. A cell is identified by `source_id`, `atlas_coords`, and `alternative_tile`, matching `TileMapLayer.set_cell()`.
4. Atlas sources use `TileSetAtlasSource.texture`, `texture_region_size`, and `create_tile()`.
5. All mutating operations run through `EditorUndoRedoManager`; nested TileSet/atlas resource mutations use the owning `TileMapLayer` as `custom_context` so the action belongs to the edited scene history.

## Design principles

1. **Batch-oriented where it matters.** Painting or erasing many cells should take one MCP call and one Undo/Redo action.
2. **Generic fallback stays intact.** Specialized tools cover common tile workflows only; unsupported TileSet properties remain reachable through generic APIs.
3. **No hidden replacement.** Atlas/source creation refuses conflicts rather than silently replacing existing sources or tiles.
4. **Bounded inputs and outputs.** Batch cell/tile calls and inspection responses have explicit limits.
5. **Project-path safety only for files.** Texture paths are filesystem/resource paths and pass existing project-path security checks. Node paths and tile coordinates are semantic data, never filesystem targets.
6. **Deterministic resource ownership.** `tileset.ensure_for_layer` creates an embedded TileSet only when the layer has none. It never overwrites an existing TileSet.
7. **Exact Undo/Redo.** Mutations capture exact previous cell/source/resource state so one Undo reverses one MCP call.

## Shared data shapes

### `Vector2i` input/output

Use ergonomic JSON objects:

```json
{ "x": 4, "y": -2 }
```

Every map coordinate is validated as an integer in `-32768..32767`.

Atlas coordinates and atlas tile sizes are non-negative integers unless Godot uses the invalid sentinel internally; sentinels are returned by inspection but are not accepted for atlas creation.

### Cell descriptor

```json
{
  "coords": { "x": 2, "y": 3 },
  "source_id": 0,
  "atlas_coords": { "x": 1, "y": 0 },
  "alternative_tile": 0
}
```

An empty cell is represented by `source_id: -1`, `atlas_coords: {x:-1,y:-1}`, `alternative_tile: -1` in read results.

## TileMapLayer API

### `tilemap.inspect`

Input:

```json
{ "node_path": "/Main/Ground" }
```

Target must inherit `TileMapLayer`.

Returns:

- logical `node_path`
- class name
- whether a TileSet is assigned
- `tile_size` when a TileSet exists
- used-cell count
- used rect as position/size
- enabled state
- collision/navigation enabled state

Read-only and bounded; it does not enumerate every cell.

### `tilemap.get_cells`

Input:

```json
{
  "node_path": "/Main/Ground",
  "coords": [{"x":0,"y":0},{"x":1,"y":0}]
}
```

`coords` is optional. If supplied, inspect exactly those cells. If omitted, enumerate all used cells.

Limits:

- request: maximum 4096 coordinates
- enumeration: maximum 4096 used cells; above this return `LIMIT_EXCEEDED` instead of truncating silently

Returns cell descriptors sorted by Y then X for deterministic output.

### `tilemap.set_cell`

Input:

```json
{
  "node_path": "/Main/Ground",
  "coords": {"x":3,"y":2},
  "source_id": 0,
  "atlas_coords": {"x":1,"y":0},
  "alternative_tile": 0
}
```

Requirements:

- assigned TileSet exists
- source exists
- atlas source coordinates exist when source is `TileSetAtlasSource`
- alternative ID is non-negative

Undo restores the exact previous cell identifiers.

### `tilemap.set_cells`

Input contains `node_path` and `cells`, an array of cell descriptors without empty sentinels.

Limits:

- 1..4096 cells per call
- duplicate coordinates in one request are rejected as `INVALID_ARGUMENT`

Behavior:

- validate the entire batch before mutation
- one Undo/Redo action for the whole batch
- Undo restores every previous cell exactly
- result reports `changed_count`

This operation is atomic from the MCP user's perspective: validation failure changes nothing.

### `tilemap.erase_cells`

Input contains `node_path` and 1..4096 unique coordinates.

The operation captures every previous cell, erases the requested coordinates, and Undo restores occupied cells while leaving previously empty cells empty.

### `tilemap.clear`

Clears the entire TileMapLayer as one Undo/Redo action.

To keep rollback bounded, the operation refuses to clear when more than 4096 used cells exist and returns `LIMIT_EXCEEDED`. Large maps remain editable through chunked `erase_cells`.

### `tilemap.map_to_local`

Input: `node_path`, `coords`.

Returns Godot's local `Vector2` center position for the map coordinate.

Read-only.

### `tilemap.local_to_map`

Input: `node_path`, local `position: {x:number,y:number}`.

Returns the `Vector2i` map coordinate produced by Godot.

Read-only.

## TileSet / atlas API

TileSet tools operate through a `TileMapLayer` path. The layer is the scene-owned context for Undo/Redo and determines which TileSet is being edited.

### `tileset.inspect`

Input:

```json
{ "node_path": "/Main/Ground" }
```

Returns:

- whether TileSet exists
- TileSet resource path when externally saved, otherwise empty string
- tile size
- source count
- each source ID and source class
- for atlas sources: texture resource path, texture region size, margins, separation, atlas grid size, and tile count

The total source list is limited to 512 sources.

### `tileset.ensure_for_layer`

Input:

```json
{
  "node_path": "/Main/Ground",
  "tile_size": {"x":32,"y":32}
}
```

Behavior:

- if no TileSet exists, create an embedded `TileSet`, set `tile_size`, assign it to the layer, and return `created: true`
- if one already exists, leave it unchanged and return `created: false` plus its current tile size
- it never replaces an existing TileSet or changes its tile size

Undo only exists when the call created a TileSet and restores the previous `null` assignment.

Tile size components must be positive integers.

### `tileset.add_atlas_source`

Input:

```json
{
  "node_path": "/Main/Ground",
  "texture_path": "res://tiles/terrain.png",
  "texture_region_size": {"x":32,"y":32},
  "source_id": 0,
  "margins": {"x":0,"y":0},
  "separation": {"x":0,"y":0}
}
```

Fields:

- `source_id` optional; when omitted use `TileSet.get_next_source_id()`
- margins/separation optional, default zero

Behavior:

- layer must already have a TileSet
- texture path must resolve inside the project and load as `Texture2D`
- source ID must not already exist
- create `TileSetAtlasSource`, assign texture, texture-region size, margins/separation, and add it to TileSet
- Undo removes exactly that source

If changing the atlas parameters would make the region size smaller than TileSet.tile_size, return `INVALID_ARGUMENT` before mutation.

### `tileset.inspect_atlas_source`

Input: `node_path`, `source_id`.

Target source must be `TileSetAtlasSource`.

Returns source metadata plus every base tile coordinate and its atlas size. Response is limited to 4096 base tiles.

Read-only.

### `tileset.create_atlas_tiles`

Input:

```json
{
  "node_path": "/Main/Ground",
  "source_id": 0,
  "tiles": [
    {"atlas_coords":{"x":0,"y":0}},
    {"atlas_coords":{"x":1,"y":0},"size":{"x":1,"y":1}}
  ]
}
```

Limits: 1..4096 tiles.

Behavior:

- validate source type, coordinates, positive sizes, duplicates, texture bounds/room, and existing tiles before mutation
- refuse an existing tile with `ALREADY_EXISTS`
- create all tiles in one Undo/Redo action
- Undo removes only tiles created by this call

This phase creates base alternative `0` only.

### `tileset.remove_source`

Input: `node_path`, `source_id`.

Behavior:

- source must exist
- refuse removal if any cell in any edited-scene `TileMapLayer` sharing the same TileSet currently references the source, returning `SOURCE_IN_USE`
- remove the source in one Undo/Redo action
- Undo restores the exact same TileSetSource resource at the same source ID

This conservative rule prevents silently invalidating painted cells, including cells owned by another layer that shares the same TileSet resource.

## Undo/Redo model

All mutating handlers receive `EditorUndoRedoManager` and create one action per MCP call.

Use the owning `TileMapLayer` as the action's `custom_context`, including TileSet and atlas resource edits. This binds nested resource edits to the scene history rather than relying on global-history inference.

Batch actions add all do/undo calls before committing. Validation is completed before `create_action()` whenever possible.

## Errors

Expected domain errors use extensible protocol codes:

- `NODE_NOT_FOUND`
- `INVALID_NODE_TYPE`
- `TILESET_NOT_FOUND`
- `SOURCE_NOT_FOUND`
- `INVALID_SOURCE_TYPE`
- `TILE_NOT_FOUND`
- `SOURCE_IN_USE`
- `ALREADY_EXISTS`
- `LIMIT_EXCEEDED`
- `INVALID_ARGUMENT`
- `RESOURCE_NOT_FOUND`
- `INVALID_RESOURCE_TYPE`

No expected user error should surface as an internal timeout.

## Security and risk policy

Read-only:

- `tilemap.inspect`
- `tilemap.get_cells`
- `tilemap.map_to_local`
- `tilemap.local_to_map`
- `tileset.inspect`
- `tileset.inspect_atlas_source`

Normal editor mutations:

- `tilemap.set_cell`
- `tilemap.set_cells`
- `tilemap.erase_cells`
- `tilemap.clear`
- `tileset.ensure_for_layer`
- `tileset.add_atlas_source`
- `tileset.create_atlas_tiles`
- `tileset.remove_source`

`tileset.add_atlas_source.texture_path` is a real project resource path and must participate in the existing project-path fingerprint/security checks.

No tool in this phase receives arbitrary code or arbitrary engine method names.

## Integration acceptance test

The live Godot 4.6.3 vertical slice must:

1. create a `TileMapLayer` in a fixture scene;
2. `tileset.ensure_for_layer` with a known tile size;
3. add a generated fixture PNG as an atlas source;
4. create multiple atlas tiles;
5. paint a 5x5 pattern through `tilemap.set_cells`;
6. inspect cells and verify identifiers;
7. erase a subset, then editor Undo and Redo;
8. exercise `map_to_local` and `local_to_map` round-trip on representative cells;
9. save and reload the scene;
10. verify TileSet source, atlas tiles, and painted cells persist;
11. verify `SOURCE_IN_USE` prevents source removal while cells reference it;
12. clear/erase the references and remove the source, then Undo source removal;
13. verify invalid node type, coordinate-range rejection, duplicate batch coordinates, missing source, and invalid texture path return structured errors.

The existing base, runtime, workflow, recovery, and visual integration suites must remain green.
