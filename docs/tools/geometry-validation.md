# Validate 2D walkways before running the game

`geometry.validate_walkways` is a read-only preflight on the active edited scene. It compares the **full route footprint**, not a sample of centerline points, against explicitly named collision nodes in scene-global coordinates. It also measures declared endpoint connections. The tool does not save, edit, bake navigation or run the game.

```json
{
  "routes": ["/Main/CentralCross", "/Main/EntranceLink"],
  "obstacles": ["/Main/academic_block_unidentified/Collision"],
  "connections": [{
    "from": "/Main/CentralCross", "from_end": "end",
    "to": "/Main/EntranceLink", "to_end": "start", "max_gap_px": 10
  }],
  "agent_radius_px": 4,
  "max_findings": 100
}
```

Routes may be open, constant-width `Line2D` nodes or filled `Polygon2D` nodes. An open line's native points and width become polygons before testing; `Polygon2D.offset` and each node's complete global transform are included. `agent_radius_px` expands the resulting world-space footprint. Endpoint connections require two `Line2D` routes; their start/end points are compared in global coordinates.

Obstacles may be solid `CollisionPolygon2D` nodes or `CollisionShape2D` nodes containing rectangle, convex polygon, circle or capsule shapes. Disabled collisions are listed in `skippedDisabled`. Circle/capsule boundaries are conservatively approximated and listed in `approximateObstacles`. Hollow segments, one-way collisions and unsupported shapes are reported in `diagnostics` and make `complete` false. Visual sprites, arbitrary scripts, TileMap collision, dynamic bodies and navigation reachability are outside this first preflight.

`findings` contain `PATH_COLLISION` with the route/obstacle paths, a world-space contact coordinate and overlapping area, or `CONNECTION_GAP` with both endpoints and measured distance. A result is `clear: true` only when no findings remain and the scan is complete. `truncated: true` means `max_findings` stopped the result; treat `clear: false` as requiring review. Boundary-only contact has no overlap area at zero clearance, so pass a positive `agent_radius_px` when physical clearance matters.

The request is limited to 32 routes, 64 obstacles, 64 connections, 256 source points per shape and 100 findings. Unsupported or oversized shapes are reported instead of silently being treated as passable. Godot's [`Geometry2D` polygon intersection and offset APIs](https://docs.godotengine.org/en/4.6/classes/class_geometry2d.html) provide the geometric operations.
