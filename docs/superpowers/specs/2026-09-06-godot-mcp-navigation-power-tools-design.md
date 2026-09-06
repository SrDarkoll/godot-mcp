# Godot MCP Phase 4 — Navigation Power Tools Design

## Status
Approved by the user after review of the proposed unified 2D/3D Navigation API and explicit instruction to proceed.

## Goal
Give MCP clients high-level, undoable Godot 4.6 authoring primitives for NavigationRegion2D/3D, NavigationPolygon/NavigationMesh baking, and NavigationAgent2D/3D configuration without exposing NavigationServer RIDs or wrapping the full engine API.

## Principles
- Godot 4.x only; implementation and authoritative E2E target Godot 4.6.3.
- One unified `navigation.*` family detects 2D vs 3D from the targeted Godot node/resource.
- Specialized tools complement generic `node.*`, `object.*`, and `resource.*` fallback.
- Every editor mutation is project-scoped and bound to scene-context Undo/Redo.
- Resource mutations are copy-on-write: duplicate/create, fully validate/mutate the copy, then reassign it.
- Node paths and source-root paths are semantic node paths, never filesystem paths.
- No arbitrary GDScript evaluation, direct NavigationServer RID manipulation, callbacks supplied by clients, or runtime movement loop.
- The modern bake pipeline is `parse_source_geometry_data()` followed by `bake_from_source_geometry_data()` on the main thread.

## Tool surface
1. `navigation.region.inspect`
2. `navigation.region.configure`
3. `navigation.mesh.inspect`
4. `navigation.mesh.set`
5. `navigation.mesh.configure`
6. `navigation.mesh.set_outlines`
7. `navigation.mesh.bake`
8. `navigation.mesh.clear`
9. `navigation.agent.inspect`
10. `navigation.agent.configure`

## Region tools

### Supported nodes
- `NavigationRegion2D`
- `NavigationRegion3D`

`navigation.region.inspect` returns:
- `node_path`
- `type`
- `dimension: "2d" | "3d"`
- `enabled`
- `navigation_layers`
- `enter_cost`
- `travel_cost`
- `use_edge_connections`
- resource summary (`navigation_polygon` or `navigation_mesh`, type/path/polygon count)

`navigation.region.configure` accepts partial:
- `enabled: bool`
- `navigation_layers: uint32 bitmask`
- `enter_cost >= 0`
- `travel_cost > 0`
- `use_edge_connections: bool`

The entire prospective state is validated before mutation. One MCP call creates one Undo/Redo action.

## Navigation mesh resource tools

### Target model
All `navigation.mesh.*` tools target the owning NavigationRegion node by `node_path`.
- `NavigationRegion2D` owns `navigation_polygon: NavigationPolygon`.
- `NavigationRegion3D` owns `navigation_mesh: NavigationMesh`.

A resource path is reported when present, but high-level mutations never edit an external/shared resource in place.

### `navigation.mesh.inspect`
Returns common metadata:
- `dimension`
- resource type/path
- vertex count
- polygon count

2D additionally returns:
- outline count and bounded outlines (max 64 outlines, max 8192 total points in serialized response)
- `agent_radius`, `cell_size`, `border_size`
- `parsed_collision_mask`
- `parsed_geometry_type`
- `source_geometry_mode`
- `source_group_name`
- `sample_partition_type`

3D additionally returns:
- `agent_height`, `agent_radius`, `agent_max_climb`, `agent_max_slope`
- `cell_size`, `cell_height`, `border_size`
- `collision_mask`
- `parsed_geometry_type`
- `source_geometry_mode`
- `source_group_name`
- `sample_partition_type`
- `region_min_size`, `region_merge_size`, `vertices_per_polygon`

If the region has no navigation resource, inspection succeeds with `resource: null` and zero counts.

### `navigation.mesh.set`
Creates a fresh embedded resource matching the region dimension and assigns it atomically:
- 2D -> `NavigationPolygon.new()`
- 3D -> `NavigationMesh.new()`

Undo restores the exact previous resource reference.

### `navigation.mesh.configure`
Requires an existing navigation resource, duplicates it deeply, applies supported settings to the duplicate, then reassigns it.

Common enum vocabulary:
- `parsed_geometry_type`: `mesh_instances | static_colliders | both`
- `source_geometry_mode`: `root_children | groups_with_children | groups_explicit`

2D fields:
- `agent_radius >= 0`
- `cell_size > 0`
- `border_size >= 0`
- `parsed_collision_mask: uint32`
- `parsed_geometry_type`
- `source_geometry_mode`
- `source_group_name` (1..128 chars when supplied)
- `sample_partition_type: convex | triangulate`

3D fields:
- `agent_height > 0`
- `agent_radius >= 0`
- `agent_max_climb >= 0`
- `agent_max_slope` in `(0, 90]`
- `cell_size > 0`
- `cell_height > 0`
- `border_size >= 0`
- `collision_mask: uint32`
- `parsed_geometry_type`
- `source_geometry_mode`
- `source_group_name` (1..128 chars when supplied)
- `sample_partition_type: watershed | monotone | layers`
- `region_min_size >= 0`
- `region_merge_size >= 0`
- `vertices_per_polygon` integer in `[3, 12]`

Dimension-specific fields passed to the wrong region return `NAVIGATION_DIMENSION_MISMATCH` rather than being ignored.

### `navigation.mesh.set_outlines`
2D only. Input is `outlines: Vector2[][]`.
- max 64 outlines
- each outline 3..4096 points
- max 8192 points total
- all coordinates finite

The handler validates the entire batch before mutation, duplicates the NavigationPolygon, clears baked vertices/polygons and old outlines, writes all new outlines, then reassigns the copy in one Undo/Redo action.

Calling it on 3D returns `NAVIGATION_OUTLINES_UNSUPPORTED`.

### `navigation.mesh.clear`
Requires an existing resource and performs copy-on-write clearing of baked navigation geometry only:
- 2D: `NavigationPolygon.clear()` (outlines/settings remain)
- 3D: `NavigationMesh.clear()`

It does not unassign the resource. Undo restores the exact previous reference.

### `navigation.mesh.bake`
Input:
- `node_path`: NavigationRegion2D/3D
- `source_root_path`: existing Node in the edited scene

The source root is a semantic NodePath, not a project file path.

Bake algorithm:
1. Resolve region and existing navigation resource.
2. Resolve `source_root_path` in the same edited scene.
3. Deep-duplicate the navigation resource.
4. Clear baked vertices/polygons on the duplicate while preserving settings and 2D outlines.
5. Create `NavigationMeshSourceGeometryData2D` or `NavigationMeshSourceGeometryData3D`.
6. Call the dimension-matched NavigationServer `parse_source_geometry_data()` on the main thread.
7. Call `bake_from_source_geometry_data()` synchronously on the duplicate.
8. Require at least one resulting polygon; otherwise return `NAVIGATION_BAKE_FAILED` without publishing the copy.
9. Assign the successful copy in one scene-bound Undo/Redo action.

For 2D, at least one outline must already exist before baking; otherwise return `NAVIGATION_BAKE_FAILED` with an explanatory message.

## Agent tools

### Supported nodes
- `NavigationAgent2D`
- `NavigationAgent3D`

`navigation.agent.inspect` reports dimension, current persistent settings, target position, and current velocity, but does not call `get_next_path_position()` or trigger a path update. On `NavigationAgent3D`, `keep_y_velocity` is omitted while `use_3d_avoidance` is `true` because Godot 4.6 marks that property with `PROPERTY_USAGE_NONE` in that mode and therefore does not serialize it.

`navigation.agent.configure` supports common fields:
- `navigation_layers: uint32`
- `path_desired_distance > 0`
- `target_desired_distance >= 0`
- `path_max_distance >= 0`
- `radius >= 0`
- `neighbor_distance >= 0`
- `max_neighbors` integer `[0, 1024]`
- `max_speed >= 0`
- `avoidance_enabled: bool`
- `avoidance_layers: uint32`
- `avoidance_mask: uint32`
- `avoidance_priority` in `[0,1]`
- `time_horizon_agents >= 0`
- `time_horizon_obstacles >= 0`
- `simplify_path: bool`
- `simplify_epsilon >= 0`

3D-only fields:
- `height > 0`
- `use_3d_avoidance: bool`
- `keep_y_velocity: bool`
- `path_height_offset: finite`

Passing 3D-only fields to NavigationAgent2D returns `NAVIGATION_DIMENSION_MISMATCH`.

`keep_y_velocity` is only authorable when the effective `use_3d_avoidance` value is `false`. Supplying `keep_y_velocity` while 3D avoidance is enabled returns `INVALID_ARGUMENT`. Enabling 3D avoidance normalizes the hidden runtime value to Godot's default `true`, so save/reload does not expose history-dependent state for a property Godot refuses to serialize in that mode.

`target_position`, `velocity`, `set_velocity_forced()`, `get_next_path_position()`, and autonomous movement are intentionally not authored in this phase. They are runtime behavior, not persistent editor setup.

## Error contract
Specialized failures:
- `NAVIGATION_TYPE_MISMATCH`: target node is not the required navigation class family.
- `NAVIGATION_RESOURCE_MISSING`: region has no NavigationPolygon/NavigationMesh for a resource mutation.
- `NAVIGATION_DIMENSION_MISMATCH`: a dimension-specific field/operation is used against the other dimension.
- `NAVIGATION_SOURCE_ROOT_NOT_FOUND`: `source_root_path` cannot be resolved in the edited scene.
- `NAVIGATION_BAKE_FAILED`: source parse/bake produced no usable navigation polygons or 2D outlines are missing.
- `NAVIGATION_OUTLINES_UNSUPPORTED`: outlines requested for a 3D region.

Existing generic errors remain valid for malformed requests and missing target nodes.

## Security and risk
Read-only tools:
- `navigation.region.inspect`
- `navigation.mesh.inspect`
- `navigation.agent.inspect`

Normal editor mutations:
- all other Phase 4 tools

No Phase 4 argument is a filesystem path. `node_path` and `source_root_path` are audit-only semantic targets.

## Undo/Redo and persistence
- One mutation call = one EditorUndoRedoManager action.
- Actions are bound to the edited scene context node.
- Resource mutations replace whole copy-on-write resource references; undo restores the exact prior reference.
- Region and agent configuration snapshots restore all touched persistent properties exactly.
- Scene save/reload is part of E2E acceptance.

## Limits
- navigation bitmasks: unsigned 32-bit, `0..4294967295`.
- outlines: max 64.
- points per outline: max 4096.
- total outline points: max 8192.
- serialized outline response: max 64 outlines / 8192 points.
- source group name: max 128 characters.
- vertices per polygon: 3..12.

## Out of scope for Phase 4
- NavigationLink2D/3D.
- NavigationObstacle2D/3D.
- Direct NavigationServer RID tools or map-level settings.
- Creating alternate navigation maps.
- Runtime movement, steering loops, path polling, or velocity callbacks.
- Async bake jobs and cancellation.
- Persisting parsed source geometry caches as external resources.
- External `.tres` navigation resource authoring as a specialized workflow.
- Manual polygon-index/vertex editing in 3D.
- Imported mesh/navigation import settings.

## E2E vertical slice
A live Godot fixture creates both dimensions in one scene:

```text
Main: Node
├── World2D: Node2D
│   ├── Region2D: NavigationRegion2D
│   ├── Source2D: Node2D
│   │   └── Floor2D: Polygon2D / StaticBody2D source geometry
│   └── Agent2D: NavigationAgent2D
└── World3D: Node3D
    ├── Region3D: NavigationRegion3D
    ├── Source3D: Node3D
    │   └── Floor3D: MeshInstance3D and/or StaticBody3D source geometry
    └── Agent3D: NavigationAgent3D
```

The test will:
1. Inspect/configure Region2D and verify Undo/Redo.
2. Create a fresh NavigationPolygon, configure bake fields, set outlines, inspect them, and verify copy-on-write Undo/Redo.
3. Bake 2D from an explicit source root and require polygons > 0.
4. Clear baked 2D geometry while preserving outlines; Undo restores baked polygons.
5. Inspect/configure Agent2D and reject a 3D-only field.
6. Inspect/configure Region3D and verify Undo/Redo.
7. Create/configure NavigationMesh, bake from explicit 3D source geometry, and require polygons > 0.
8. Clear/undo baked 3D geometry.
9. Inspect/configure Agent3D with 2D avoidance and persistent `keep_y_velocity`, then enable `use_3d_avoidance`, verify `keep_y_velocity` becomes unavailable/omitted, and reject attempts to author it while 3D avoidance is active.
10. Save/reload and verify persistent region/resource/agent state, including the absence of non-serializable `keep_y_velocity` while 3D avoidance is enabled.
11. Exercise missing resource, wrong node type, missing source root, 3D outlines, and dimension mismatch error contracts.

## Acceptance gates
- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run check:godot`
- `npm run test:integration`
- runtime integration remains 10/10
- visual integration remains 2/2

The user's Windows Godot 4.6.3 environment remains the authoritative final gate.
