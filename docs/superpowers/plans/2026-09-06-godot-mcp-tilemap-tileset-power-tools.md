# Godot MCP TileMapLayer & TileSet Atlas Power Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add high-level `tilemap.*` and `tileset.*` tools for modern TileMapLayer cell editing and embedded TileSet atlas authoring, with exact Undo/Redo and live Godot 4.6.3 coverage.

**Architecture:** Add typed protocol contracts plus thin TypeScript forwarders/registrars, then implement behavior in two focused GDScript handlers wired through the existing dispatcher. TileMapLayer owns the Undo/Redo context for both cell edits and nested TileSet/atlas edits; texture paths remain subject to project-path security while map/node/atlas coordinates remain semantic data.

**Tech Stack:** TypeScript, Zod v4, MCP TypeScript SDK v2, Godot 4.6 GDScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-godot-mcp-tilemap-tileset-power-tools-design.md`

## Global Constraints

- Godot 4.x only; validation target is Godot 4.6.3 stable on Windows.
- Specialized map tools target `TileMapLayer`; deprecated `TileMap` remains generic-fallback only.
- Map coordinates are signed integers in `-32768..32767`.
- Batch cell/tile operations are limited to 4096 entries.
- TileSet source inspection is limited to 512 sources.
- `tileset.ensure_for_layer` creates only embedded TileSet resources and never replaces an existing TileSet.
- Texture paths are real project resource paths and must keep filesystem/project security checks.
- All editor mutations use `EditorUndoRedoManager` with the owning TileMapLayer as `custom_context` when available.
- No terrains, TileSet physics/navigation/custom-data layers, scene sources, alternative-tile authoring, or Phase 2B Node2D helpers.
- Do not push, merge, or release.

---

### Task 1: Protocol contracts, forwarders, registration, and security classification

**Files:**
- Create: `packages/protocol/src/tilemap.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/protocol/test/tilemap.test.ts`
- Create: `packages/server/src/tools/tilemap-tools.ts`
- Create: `packages/server/src/tools/tileset-tools.ts`
- Create: `packages/server/src/mcp/register-tilemap-tools.ts`
- Create: `packages/server/src/mcp/register-tileset-tools.ts`
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/src/security/tool-policy.ts`
- Create: `packages/server/test/tilemap-tools.test.ts`

**Interfaces:**
- Produces `TileVector2i`, `TileCellDescriptor`, TileMap/TileSet result types, and Zod schemas for MCP registration.
- Produces forwarding functions whose RPC method names exactly match the 14 names in the spec.
- Produces `registerTilemapTools(registrar, rpc)` and `registerTilesetTools(registrar, rpc)`.

- [ ] **Step 1: Write failing protocol tests**

Create `packages/protocol/test/tilemap.test.ts` with tests equivalent to:

```ts
import { describe, expect, test } from 'vitest';
import { TileMapCoordinateSchema, TileAtlasCoordinateSchema, TileCellWriteSchema } from '../src/tilemap.js';

describe('tilemap protocol', () => {
  test('bounds serialized map coordinates to Godot 16-bit range', () => {
    expect(TileMapCoordinateSchema.parse({x:-32768,y:32767})).toEqual({x:-32768,y:32767});
    expect(()=>TileMapCoordinateSchema.parse({x:32768,y:0})).toThrow();
    expect(()=>TileMapCoordinateSchema.parse({x:0.5,y:0})).toThrow();
  });

  test('requires non-negative atlas coordinates and valid cell identifiers', () => {
    expect(TileAtlasCoordinateSchema.parse({x:0,y:1})).toEqual({x:0,y:1});
    expect(()=>TileAtlasCoordinateSchema.parse({x:-1,y:0})).toThrow();
    expect(TileCellWriteSchema.parse({coords:{x:1,y:2},source_id:0,atlas_coords:{x:0,y:0},alternative_tile:0})).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run protocol test to verify RED**

Run:

```bash
npm run test --workspace @godot-mcp/protocol -- tilemap.test.ts
```

Expected: FAIL because `src/tilemap.ts` does not exist.

- [ ] **Step 3: Implement protocol module and export it**

Define reusable schemas with the exact bounds:

```ts
const mapAxis=z.number().int().min(-32768).max(32767);
const atlasAxis=z.number().int().nonnegative();
export const TileMapCoordinateSchema=z.object({x:mapAxis,y:mapAxis});
export const TileAtlasCoordinateSchema=z.object({x:atlasAxis,y:atlasAxis});
export const TilePositiveSizeSchema=z.object({x:z.number().int().positive(),y:z.number().int().positive()});
```

Define `TileCellWriteSchema`, `TileAtlasTileCreateSchema`, and TypeScript interfaces for inspect/cell/source results. Re-export from `packages/protocol/src/index.ts`.

- [ ] **Step 4: Write failing forwarding/registration tests**

Create `packages/server/test/tilemap-tools.test.ts` asserting representative forwarding:

```ts
await setTilemapCells(rpc,{node_path:'/Main/Ground',cells:[cell]});
expect(rpc.call).toHaveBeenCalledWith('tilemap.set_cells',{node_path:'/Main/Ground',cells:[cell]});

await addTilesetAtlasSource(rpc,{node_path:'/Main/Ground',texture_path:'res://tiles.png',texture_region_size:{x:16,y:16}});
expect(rpc.call).toHaveBeenCalledWith('tileset.add_atlas_source',expect.objectContaining({texture_path:'res://tiles.png'}));
```

Also create a test server and assert all 14 MCP names are registered.

- [ ] **Step 5: Run focused server test to verify RED**

Run:

```bash
npm run test --workspace @godot-mcp/server -- tilemap-tools.test.ts
```

Expected: FAIL because the tool modules/registrars do not exist.

- [ ] **Step 6: Implement forwarders and Zod registrars**

Use `omitUndefinedValues()` for optional `source_id`, `coords`, margins, and separation. Enforce:

```ts
z.array(TileCellWriteSchema).min(1).max(4096)
z.array(TileMapCoordinateSchema).min(1).max(4096)
z.array(TileAtlasTileCreateSchema).min(1).max(4096)
```

`tilemap.get_cells.coords` is optional and max 4096. `tileset.inspect_atlas_source.source_id` and source mutation IDs are non-negative integers.

- [ ] **Step 7: Extend security policy without path ambiguity**

Add reads:

```text
tilemap.inspect
tilemap.get_cells
tilemap.map_to_local
tilemap.local_to_map
tileset.inspect
tileset.inspect_atlas_source
```

Add remaining tools to `NORMAL_MUTATIONS`.

Do not treat `node_path` as filesystem. `tileset.add_atlas_source.texture_path` must be recognized as a filesystem target. Extend `filesystemPathKeys(name)` so this tool includes `texture_path`, and add an audit display target `texture_path:<value>` only through the existing target list (no duplicate semantic-path rule).

- [ ] **Step 8: Run focused tests/build/typecheck**

Run:

```bash
npm run test --workspace @godot-mcp/protocol -- tilemap.test.ts
npm run test --workspace @godot-mcp/server -- tilemap-tools.test.ts
npm run build
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/protocol packages/server/src packages/server/test/tilemap-tools.test.ts
git commit -m "feat(power-tools): add TileMapLayer and TileSet MCP contracts"
```

---

### Task 2: TileMapLayer read/mutation handler with atomic batch Undo/Redo

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/tilemap_handlers.gd`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`
- Create: `packages/server/test/tilemap-addon-contract.test.ts`

**Interfaces:**
- Handles `tilemap.inspect`, `tilemap.get_cells`, `tilemap.set_cell`, `tilemap.set_cells`, `tilemap.erase_cells`, `tilemap.clear`, `tilemap.map_to_local`, `tilemap.local_to_map`.
- Returns plain dictionaries or existing `{"__error": ...}` envelopes.

- [ ] **Step 1: Write failing addon contract test**

Read `tilemap_handlers.gd` and dispatcher source as text and assert the eight method names, `TileMapLayer`, `MAX_BATCH = 4096`, `create_action`, and `custom_context`/layer context markers exist. This test must fail while the file is absent.

- [ ] **Step 2: Run contract test to verify RED**

Run:

```bash
npm run test --workspace @godot-mcp/server -- tilemap-addon-contract.test.ts
```

Expected: FAIL because `tilemap_handlers.gd` does not exist.

- [ ] **Step 3: Implement scene/layer/vector/cell helpers**

Add focused helpers:

```gdscript
func _root() -> Node
func _resolve_layer(root: Node, node_path: String)
func _coord(value: Variant, label: String)
func _cell(layer: TileMapLayer, coords: Vector2i) -> Dictionary
func _validate_write_cell(layer: TileMapLayer, cell: Dictionary)
func _error(code: String, message: String, data := {}) -> Dictionary
```

`_coord` enforces `-32768..32767`. `_validate_write_cell` requires TileSet/source existence, atlas tile existence for atlas sources, and non-negative alternative IDs.

- [ ] **Step 4: Implement read methods**

`inspect` returns used count/rect and TileSet flags. `get_cells` either validates requested coordinates or enumerates `get_used_cells()` with a 4096 ceiling, sorts Y/X, then uses the three `get_cell_*` APIs. Conversion tools call `map_to_local()`/`local_to_map()` directly.

- [ ] **Step 5: Implement atomic set single/batch**

For a batch:

1. validate all cells and reject duplicate coordinates before any action;
2. snapshot previous descriptors;
3. `create_action("Set TileMapLayer Cells", 0, layer)`;
4. add `set_cell` do calls for requested cells;
5. add undo `erase_cell` for previously empty cells or exact `set_cell` for occupied cells;
6. commit once.

`set_cell` delegates internally to the same batch path with one entry.

- [ ] **Step 6: Implement erase and bounded clear**

`erase_cells` validates unique coords, snapshots prior state, and performs one action. `clear` obtains `get_used_cells()`, rejects >4096, snapshots them, calls `clear()` once for do, and adds exact `set_cell` undo calls.

- [ ] **Step 7: Wire dispatcher**

Instantiate the handler with editor interface/UndoRedo dependencies following existing UI/Animation patterns and route all eight methods.

- [ ] **Step 8: Run syntax/contract checks**

Run:

```bash
npm run test --workspace @godot-mcp/server -- tilemap-addon-contract.test.ts
npm run check:godot
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/godot-addon packages/server/test/tilemap-addon-contract.test.ts
git commit -m "feat(power-tools): add TileMapLayer editing handlers"
```

---

### Task 3: Embedded TileSet and atlas-source handler with nested-resource Undo/Redo

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/tileset_handlers.gd`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`
- Create: `packages/server/test/tileset-addon-contract.test.ts`

**Interfaces:**
- Handles `tileset.inspect`, `tileset.ensure_for_layer`, `tileset.add_atlas_source`, `tileset.inspect_atlas_source`, `tileset.create_atlas_tiles`, `tileset.remove_source`.
- Uses owning TileMapLayer as Undo/Redo custom context for all nested TileSet/atlas mutations.

- [ ] **Step 1: Write failing addon contract test**

Assert the handler contains all six methods plus `TileSetAtlasSource`, `ResourceLoader`, `MAX_TILES = 4096`, `MAX_SOURCES = 512`, `has_room_for_tile`, and Undo/Redo calls using layer context.

- [ ] **Step 2: Run contract test to verify RED**

Run:

```bash
npm run test --workspace @godot-mcp/server -- tileset-addon-contract.test.ts
```

Expected: FAIL because handler is missing.

- [ ] **Step 3: Implement shared layer/TileSet/source inspection helpers**

Resolve only TileMapLayer targets. Return `TILESET_NOT_FOUND`, `SOURCE_NOT_FOUND`, or `INVALID_SOURCE_TYPE` explicitly. Atlas inspection enumerates source IDs with `get_source_id(index)`, base tiles with `get_tile_id(index)`, and returns texture/resource metadata; enforce 512 sources / 4096 tiles.

- [ ] **Step 4: Implement `ensure_for_layer`**

If `layer.tile_set` exists, return it unchanged with `created:false`. Otherwise create `TileSet.new()`, set positive `tile_size`, and assign through one Undo/Redo action:

```gdscript
undo_redo.create_action("Create Embedded TileSet", 0, layer)
undo_redo.add_do_property(layer, "tile_set", tile_set)
undo_redo.add_undo_property(layer, "tile_set", null)
undo_redo.commit_action()
```

- [ ] **Step 5: Implement atlas-source creation**

Load `texture_path` through `ResourceLoader.load()`, require `Texture2D`, validate region size >= TileSet.tile_size, non-negative margins/separation, and source-ID availability. Construct one `TileSetAtlasSource`, set its properties, and add/remove it via UndoRedo using the layer context.

- [ ] **Step 6: Implement batch base-tile creation**

Validate entire request before mutation:

- 1..4096 entries;
- unique atlas coordinates;
- non-negative coords and positive sizes;
- tile absent;
- `has_room_for_tile(coords,size,1,Vector2i.ZERO,1)` is true.

Create all tiles as do calls and remove them as undo calls. Use `remove_tile(atlas_coords)` for Undo.

- [ ] **Step 7: Implement conservative source removal**

Before removal, recursively inspect every edited-scene `TileMapLayer` sharing the same TileSet and reject if any `get_cell_source_id(coords) == source_id` with `SOURCE_IN_USE`. Snapshot the exact `TileSetSource` reference, then do `remove_source(source_id)` and undo `add_source(source, source_id)`.

- [ ] **Step 8: Wire dispatcher and run checks**

Run:

```bash
npm run test --workspace @godot-mcp/server -- tileset-addon-contract.test.ts
npm run check:godot
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/godot-addon packages/server/test/tileset-addon-contract.test.ts
git commit -m "feat(power-tools): add embedded TileSet atlas handlers"
```

---

### Task 4: Live Godot vertical slice, fixtures, documentation, and full regression gates

**Files:**
- Create: `tests/integration/tilemap-tileset-power-tools.test.ts`
- Modify: `scripts/run-integration.mjs` only if the existing default test glob does not already include the new file
- Modify: `README.md`

**Interfaces:**
- Proves the complete Phase 2A flow through stdio MCP and a real Godot editor.

- [ ] **Step 1: Write the integration test before production adjustments**

Create a fixture project with a minimal scene and generate a small atlas PNG using the test harness's existing binary-fixture utilities or a fixed checked-in PNG if already supported. Through MCP:

```ts
await call('node.create',{parent_path:'/Main',type:'TileMapLayer',name:'Ground'});
await call('tileset.ensure_for_layer',{node_path:'/Main/Ground',tile_size:{x:16,y:16}});
const source=await call('tileset.add_atlas_source',{node_path:'/Main/Ground',texture_path:'res://tiles.png',texture_region_size:{x:16,y:16}});
await call('tileset.create_atlas_tiles',{node_path:'/Main/Ground',source_id:source.structuredContent.source_id,tiles:[
  {atlas_coords:{x:0,y:0}},{atlas_coords:{x:1,y:0}},{atlas_coords:{x:0,y:1}},{atlas_coords:{x:1,y:1}}
]});
```

Build 25 cell descriptors and call `tilemap.set_cells`. Assert `tilemap.get_cells`, coordinate conversion, `SOURCE_IN_USE`, erase + editor undo/redo, save/reload persistence, source remove + undo, and structured invalid-input errors.

- [ ] **Step 2: Run the new E2E and verify RED/first real failure**

Run:

```bash
npm run test:integration
```

Expected on the development machine without Godot: unavailable/blocked. On Windows with `GODOT_BIN`, the new test must initially expose any GDScript/API incompatibility before the phase is declared complete.

- [ ] **Step 3: Update README with the exact 14 tool names**

Add a concise `TileMapLayer / TileSet atlas` section. State that specialized tools target modern `TileMapLayer`, that batches are bounded, and that terrains/physics/navigation layers are not yet part of Phase 2A.

- [ ] **Step 4: Run local static verification**

Run all available checks in the current environment:

```bash
git diff --check
node --check scripts/run-integration.mjs
```

Also syntax-parse every TypeScript file using the available TypeScript compiler API or global `tsc` when project dependencies are unavailable.

- [ ] **Step 5: Run full authoritative Windows gates**

On the user's Godot 4.6.3 environment:

```powershell
npm run build
npm run typecheck
npm test
npm run check:godot
npm run test:integration
$env:GODOT_RUNTIME_INTEGRATION="1"
npm run test:integration:runtime
$env:GODOT_VISUAL_INTEGRATION="1"
npm run test:integration:visual
```

Expected: all suites green before calling Phase 2A complete.

- [ ] **Step 6: Commit E2E/docs**

```bash
git add tests/integration/tilemap-tileset-power-tools.test.ts README.md scripts/run-integration.mjs
git commit -m "test(power-tools): verify TileMapLayer and TileSet vertical slice"
```
