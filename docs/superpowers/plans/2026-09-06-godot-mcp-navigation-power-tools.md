# Godot MCP Navigation Power Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified, undoable Godot 4.6 `navigation.*` tool family for regions, navigation mesh resources/baking, and agents across 2D and 3D.

**Architecture:** Add one protocol module and one server registrar/forwarder module for all ten tools. Implement one focused GDScript navigation handler that detects 2D vs 3D, uses copy-on-write for NavigationPolygon/NavigationMesh mutations, and routes modern parse+bake through NavigationServer2D/3D while keeping Undo/Redo scene-bound.

**Tech Stack:** TypeScript, Zod v4, MCP SDK, GDScript, Godot 4.6 NavigationRegion2D/3D, NavigationPolygon, NavigationMesh, NavigationAgent2D/3D, NavigationServer2D/3D, EditorUndoRedoManager, Vitest, live Godot integration tests.

**Spec:** `docs/superpowers/specs/2026-09-06-godot-mcp-navigation-power-tools-design.md`

## Global Constraints
- Godot 4.x only; authoritative final integration target is Godot 4.6.3 on the user's Windows environment.
- Unified `navigation.*` APIs infer dimension from actual Godot node/resource type.
- No arbitrary GDScript eval, direct NavigationServer RID tooling, client callbacks, or runtime movement loop.
- Every mutation uses scene-bound Undo/Redo.
- Navigation resource mutations are copy-on-write and restore the exact previous resource reference on undo.
- `node_path` and `source_root_path` are semantic NodePaths, not filesystem paths.
- Modern bake flow is main-thread `parse_source_geometry_data()` followed by synchronous `bake_from_source_geometry_data()`.
- Outlines are 2D-only, max 64 outlines, max 4096 points each, max 8192 total points.

---

### Task 1: Protocol contracts, forwarders, registration, and policy

**Files:**
- Create: `packages/protocol/src/navigation.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/protocol/test/navigation.test.ts`
- Create: `packages/server/src/tools/navigation-tools.ts`
- Create: `packages/server/src/mcp/register-navigation-tools.ts`
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/src/security/tool-policy.ts`
- Create: `packages/server/test/navigation-tools.test.ts`
- Modify: `packages/server/test/mcp-server.test.ts`
- Modify: `packages/server/test/tool-policy.test.ts`

**Interfaces:**
- Produces ten schemas and typed result interfaces for the exact tool names in the spec.
- Produces typed forwarders `inspectNavigationRegion`, `configureNavigationRegion`, `inspectNavigationMesh`, `setNavigationMesh`, `configureNavigationMesh`, `setNavigationOutlines`, `bakeNavigationMesh`, `clearNavigationMesh`, `inspectNavigationAgent`, `configureNavigationAgent`.
- Registers three read tools and seven normal mutations.

- [ ] **Step 1: Write failing protocol tests**

Add `packages/protocol/test/navigation.test.ts` with assertions equivalent to:

```ts
expect(NavigationRegionConfigureSchema.safeParse({node_path:'/Main/R',travel_cost:0}).success).toBe(false);
expect(NavigationMeshSetOutlinesSchema.safeParse({
  node_path:'/Main/R',
  outlines:[[{x:0,y:0},{x:10,y:0},{x:10,y:10}]]
}).success).toBe(true);
expect(NavigationAgentConfigureSchema.safeParse({node_path:'/Main/A',height:0}).success).toBe(false);
```

Also assert total outline points above 8192 are rejected and `source_root_path` is bounded to 1024 characters.

- [ ] **Step 2: Write failing server registration/policy tests**

Add focused tests proving:

```ts
expect(toolNames).toContain('navigation.mesh.bake');
expect(await policy.assess('navigation.mesh.bake',{
  node_path:'/Main/Region',source_root_path:'/Main/Source'
})).toMatchObject({risk:'normal'});
```

Assert `source_root_path` is not treated as a filesystem fingerprint target and both semantic paths appear in audit/display targets.

- [ ] **Step 3: Run focused tests and confirm RED**

```bash
npm run test --workspace @godot-mcp/protocol -- navigation.test.ts
npm run test --workspace @godot-mcp/server -- navigation-tools.test.ts mcp-server.test.ts tool-policy.test.ts
```

Expected: failures because Phase 4 contracts/registrar/forwarders do not exist.

- [ ] **Step 4: Implement schemas, result types, forwarders, registrar, server registration, and policy**

Use bounded Zod schemas:

```ts
const uint32=z.number().int().min(0).max(4294967295);
const nodePath=z.string().min(1).max(1024);
const point= z.object({x:finite,y:finite});
```

`NavigationMeshConfigureSchema` is one object with optional 2D/3D fields; dimension mismatch is a Godot handler error because the protocol cannot know node dimension.

`NavigationMeshSetSchema` contains only `{node_path}` and creates a new correctly typed embedded resource.

- [ ] **Step 5: Run focused tests/build/typecheck**

```bash
npm run test --workspace @godot-mcp/protocol -- navigation.test.ts
npm run test --workspace @godot-mcp/server -- navigation-tools.test.ts mcp-server.test.ts tool-policy.test.ts
npm run build
npm run typecheck
```

Expected: PASS in a complete Node environment.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol packages/server
git commit -m "feat(navigation): add MCP contracts and registration"
```

---

### Task 2: Region and agent Godot handlers

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/navigation_handlers.gd`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`
- Create: `packages/server/test/navigation-addon-contract.test.ts`

**Interfaces:**
- Handler constructor consumes `EditorInterface` and obtains `EditorUndoRedoManager` exactly like existing 2D/3D handlers.
- Public methods: `inspect_region`, `configure_region`, `inspect_mesh`, `set_mesh`, `configure_mesh`, `set_outlines`, `bake_mesh`, `clear_mesh`, `inspect_agent`, `configure_agent`.
- Error dictionaries use `__error` with codes from the spec.

- [ ] **Step 1: Write failing addon contract tests**

Require source markers for:

```text
NavigationRegion2D
NavigationRegion3D
NavigationAgent2D
NavigationAgent3D
NAVIGATION_TYPE_MISMATCH
NAVIGATION_DIMENSION_MISMATCH
undo_redo.create_action
```

Require action names `Configure Navigation Region` and `Configure Navigation Agent`, and require the calls to be scene-context bound.

- [ ] **Step 2: Run contract test and confirm RED**

```bash
npm run test --workspace @godot-mcp/server -- navigation-addon-contract.test.ts
```

Expected: handler file does not exist.

- [ ] **Step 3: Implement node resolution, inspection, validation, and exact Undo/Redo snapshots for regions and agents**

Region restore pattern:

```gdscript
func _restore_region(node: Node, state: Dictionary) -> void:
    node.enabled = state.enabled
    node.navigation_layers = state.navigation_layers
    node.enter_cost = state.enter_cost
    node.travel_cost = state.travel_cost
    node.use_edge_connections = state.use_edge_connections
```

Agent restore uses only persistent fields supported by the node dimension. Reject 3D-only fields on NavigationAgent2D before mutation.

- [ ] **Step 4: Wire dispatcher and run contract/static checks**

Add the ten method cases to `rpc_dispatcher.gd` and instantiate the new handler with the same editor interface lifecycle as adjacent power-tool handlers.

Run:

```bash
npm run test --workspace @godot-mcp/server -- navigation-addon-contract.test.ts
npm run check:godot
```

Expected: contract PASS; Godot syntax PASS where Godot 4.6.3 is available.

- [ ] **Step 5: Commit**

```bash
git add packages/godot-addon packages/server/test/navigation-addon-contract.test.ts
git commit -m "feat(navigation): add region and agent handlers"
```

---

### Task 3: Copy-on-write navigation resources and baking

**Files:**
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/handlers/navigation_handlers.gd`
- Modify: `packages/server/test/navigation-addon-contract.test.ts`

**Interfaces:**
- 2D resource property is `navigation_polygon`; 3D is `navigation_mesh`.
- Every resource mutation creates/duplicates a resource and reassigns it; no in-place mutation of the original target resource.
- Bake consumes `source_root_path` and never accepts a Callable from MCP.

- [ ] **Step 1: Extend contract test in RED state**

Require markers:

```text
NavigationPolygon.new()
NavigationMesh.new()
duplicate(true)
NavigationMeshSourceGeometryData2D.new()
NavigationMeshSourceGeometryData3D.new()
NavigationServer2D.parse_source_geometry_data
NavigationServer2D.bake_from_source_geometry_data
NavigationServer3D.parse_source_geometry_data
NavigationServer3D.bake_from_source_geometry_data
NAVIGATION_RESOURCE_MISSING
NAVIGATION_SOURCE_ROOT_NOT_FOUND
NAVIGATION_BAKE_FAILED
NAVIGATION_OUTLINES_UNSUPPORTED
```

Also assert the resource assignment helper restores exact previous/new references through Undo/Redo.

- [ ] **Step 2: Run focused contract test and confirm RED**

```bash
npm run test --workspace @godot-mcp/server -- navigation-addon-contract.test.ts
```

Expected: missing copy-on-write/bake markers.

- [ ] **Step 3: Implement mesh inspection/set/configure/outlines/clear**

Implement dimension-specific enum translation helpers. For outlines, pre-validate all arrays, deep-duplicate the NavigationPolygon, call `clear()` + `clear_outlines()`, add every PackedVector2Array, then atomically assign the duplicate.

`clear_mesh` duplicates the current resource and calls only `clear()`, preserving 2D outlines and all bake configuration.

- [ ] **Step 4: Implement synchronous modern bake**

2D:

```gdscript
var copy: NavigationPolygon = current.duplicate(true)
if copy.get_outline_count() == 0:
    return _error("NAVIGATION_BAKE_FAILED", "NavigationPolygon needs at least one outline")
copy.clear()
var data := NavigationMeshSourceGeometryData2D.new()
NavigationServer2D.parse_source_geometry_data(copy, data, source_root)
NavigationServer2D.bake_from_source_geometry_data(copy, data)
if copy.get_polygon_count() <= 0:
    return _error("NAVIGATION_BAKE_FAILED", "2D navigation bake produced no polygons")
```

3D mirrors this with `NavigationMeshSourceGeometryData3D` and `NavigationServer3D`.

Only assign the copy after polygon count is positive.

- [ ] **Step 5: Run contract/static checks**

```bash
npm run test --workspace @godot-mcp/server -- navigation-addon-contract.test.ts
npm run check:godot
```

Expected: contract PASS; Godot syntax PASS in authoritative environment.

- [ ] **Step 6: Commit**

```bash
git add packages/godot-addon packages/server/test/navigation-addon-contract.test.ts
git commit -m "feat(navigation): add copy-on-write mesh baking"
```

---

### Task 4: Live Godot vertical slice, documentation, and compatibility gates

**Files:**
- Create: `tests/integration/navigation-power-tools.test.ts`
- Create: `docs/tools/navigation.md`
- Modify: `README.md`

**Interfaces:**
- Uses existing integration helper conventions and a real Godot editor fixture.
- Exercises all ten tools and the error contracts listed in the spec.

- [ ] **Step 1: Write the real-Godot E2E first**

Create one scene containing `NavigationRegion2D`, `NavigationAgent2D`, `NavigationRegion3D`, and `NavigationAgent3D` plus bake source geometry. Exercise:

```text
Region2D configure -> undo/redo
mesh.set -> mesh.configure -> set_outlines -> bake -> clear -> undo
Agent2D configure + 3D-only rejection
Region3D configure -> undo/redo
mesh.set -> mesh.configure -> bake -> clear -> undo
Agent3D configure
scene.save -> scene.reload -> inspect persistence
negative error contracts
```

- [ ] **Step 2: Run standard integration and debug only the first real failure**

```bash
npm run test:integration
```

Expected: `tests/integration/navigation-power-tools.test.ts` passes alongside all prior vertical slices.

- [ ] **Step 3: Write tool documentation and README index entry**

Document all ten tools, dimension inference, copy-on-write guarantees, bake source-root semantics, outline limits, supported config fields, and out-of-scope runtime movement.

- [ ] **Step 4: Run full available gates**

```bash
npm run build
npm run typecheck
npm test
npm run check:godot
npm run test:integration
GODOT_RUNTIME_INTEGRATION=1 npm run test:integration:runtime
GODOT_VISUAL_INTEGRATION=1 npm run test:integration:visual
```

Expected: runtime remains 10/10 and visual remains 2/2. If Godot is unavailable locally, do not mark those gates green; package the work for the user's authoritative Windows Godot 4.6.3 run.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/navigation-power-tools.test.ts docs/tools/navigation.md README.md
git commit -m "test(navigation): verify navigation vertical slice"
```

---

## Self-review checklist
- Every one of the ten tools has protocol schema, typed forwarder, MCP registration, policy classification, dispatcher route, GDScript implementation, contract coverage, and E2E exercise.
- All resource mutation paths are copy-on-write and scene-context Undo/Redo.
- `source_root_path` is never fingerprinted as filesystem.
- 2D outlines are bounded and batch-validated before mutation.
- No direct RID/map-control escape hatch or autonomous movement loop was introduced.
- No placeholders or deferred implementation language remains.
