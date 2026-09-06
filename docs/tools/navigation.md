# Navigation power tools

Godot MCP provides a focused, dimension-aware navigation authoring surface for Godot 4.x. The same `navigation.*` tools work with both 2D and 3D nodes where their concepts overlap, while dimension-specific settings are rejected explicitly instead of being silently ignored.

These helpers complement the generic `node.*`, `object.*`, and `resource.*` tools. They do not expose NavigationServer RIDs or arbitrary callbacks.

## Regions

| Tool | Purpose |
| --- | --- |
| `navigation.region.inspect` | Inspect a `NavigationRegion2D` or `NavigationRegion3D`, common costs/layers, and its assigned navigation resource. |
| `navigation.region.configure` | Atomically configure common persistent region properties with scene-bound Undo/Redo. |

Supported common properties are `enabled`, `navigation_layers`, `enter_cost`, `travel_cost`, and `use_edge_connections`. `enter_cost` must be nonnegative and `travel_cost` positive.

## Navigation resources

| Tool | Purpose |
| --- | --- |
| `navigation.mesh.inspect` | Inspect the region's `NavigationPolygon` or `NavigationMesh`, bake configuration, and bounded 2D outlines. |
| `navigation.mesh.set` | Create and assign a fresh embedded navigation resource matching the region dimension. |
| `navigation.mesh.configure` | Copy-on-write configure bake settings on the assigned resource. |
| `navigation.mesh.set_outlines` | Replace 2D `NavigationPolygon` outlines atomically. |
| `navigation.mesh.bake` | Parse an explicit scene source root and synchronously bake a copy of the resource. |
| `navigation.mesh.clear` | Clear baked vertices/polygons copy-on-write while preserving configuration and 2D outlines. |

`navigation.mesh.set` creates a `NavigationPolygon` for `NavigationRegion2D` and a `NavigationMesh` for `NavigationRegion3D`. Resource mutations are copy-on-write: the existing resource is deep-duplicated, changed off to the side, and only then swapped onto the region. Undo restores the exact previous resource reference.

### 2D outlines

`navigation.mesh.set_outlines` is 2D-only. A request may contain at most 64 outlines, each outline 3–4096 finite points, and no more than 8192 points total.

Example:

```json
{
  "node_path":"/Main/Nav/Region",
  "outlines":[[
    {"x":0,"y":0},
    {"x":0,"y":512},
    {"x":512,"y":512},
    {"x":512,"y":0}
  ]]
}
```

Replacing outlines also clears the previously baked vertices/polygons on the duplicate so stale bake data cannot survive a changed boundary.

### Bake configuration

Common configuration includes agent radius, cell size, border size, parsed geometry type (`mesh_instances`, `static_colliders`, `both`), source geometry mode (`root_children`, `groups_with_children`, `groups_explicit`), source group name, and a dimension-specific partition mode.

2D additionally supports `parsed_collision_mask` and partition modes `convex` / `triangulate`.

3D additionally supports `agent_height`, `agent_max_climb`, `agent_max_slope`, `cell_height`, `collision_mask`, `region_min_size`, `region_merge_size`, `vertices_per_polygon`, and partition modes `watershed` / `monotone` / `layers`.

Supplying a setting that belongs to the other dimension returns `NAVIGATION_DIMENSION_MISMATCH`.

### Baking

A bake request names both the region and an explicit source root in the currently edited scene:

```json
{
  "node_path":"/Main/Nav/Region",
  "source_root_path":"/Main/World"
}
```

The helper requires an existing navigation resource. It deep-duplicates that resource, clears only prior baked geometry, parses source geometry on the editor/main thread, performs the synchronous Godot bake on the duplicate, and publishes it only if the bake produced polygons. The original shared resource is therefore never mutated in place.

A 2D `NavigationPolygon` must already have at least one outline before baking. `source_root_path` is a semantic scene node path, not a filesystem path and is not filesystem-fingerprinted.

## Agents

| Tool | Purpose |
| --- | --- |
| `navigation.agent.inspect` | Inspect persistent `NavigationAgent2D` / `NavigationAgent3D` pathfinding and avoidance configuration without advancing a path. |
| `navigation.agent.configure` | Atomically configure persistent pathfinding/avoidance settings with scene-bound Undo/Redo. |

Common authored fields include navigation layers, desired/path distances, radius, neighbor distance/count, max speed, avoidance enable/layers/mask/priority, time horizons, and path simplification.

3D additionally supports `height`, `use_3d_avoidance`, `keep_y_velocity`, and `path_height_offset`. `keep_y_velocity` is only authorable while `use_3d_avoidance=false`; Godot 4.6 hides it from storage when 3D avoidance is enabled, so the MCP omits it from inspection in that mode and rejects attempts to set it with `INVALID_ARGUMENT`.

`target_position` and `velocity` are inspectable but intentionally not authored by these editor tools. Runtime path following remains game logic: the MCP does not install a movement loop or call `get_next_path_position()` automatically.

## Errors and safety

Specialized errors include:

- `NAVIGATION_TYPE_MISMATCH` — the target node is not the required navigation node family.
- `NAVIGATION_RESOURCE_MISSING` — a region has no `NavigationPolygon` / `NavigationMesh` assigned.
- `NAVIGATION_DIMENSION_MISMATCH` — an otherwise valid option belongs to the other dimension.
- `NAVIGATION_SOURCE_ROOT_NOT_FOUND` — the requested bake source root is absent from the edited scene.
- `NAVIGATION_BAKE_FAILED` — the resource cannot be baked or the bake produces no polygons.
- `NAVIGATION_OUTLINES_UNSUPPORTED` — outlines were requested for 3D navigation.

Navigation mutations are normal editor mutations and require the existing editor/filesystem permissions. Region, resource and agent inspections are read operations. This phase intentionally does not add raw NavigationServer RID tools, navigation links/obstacles, asynchronous bake callbacks, autonomous agent motion, or runtime path-following helpers.
