# Godot MCP 2D Power Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, Undo/Redo-aware MCP power tools for Node2D, Sprite2D, Camera2D, CollisionShape2D, and Parallax2D.

**Architecture:** Follow the existing specialized-tool vertical slice: Zod protocol contracts -> MCP registrar -> typed server forwarders -> authenticated bridge RPC -> focused GDScript handlers using EditorUndoRedoManager custom context. Read tools return canonical snapshots; mutation tools validate first, commit one action, and return the resulting snapshot.

**Tech Stack:** TypeScript, Zod v4, MCP TypeScript SDK, Godot 4.6 GDScript, Vitest, real Godot integration harness.

**Spec:** `docs/superpowers/specs/2026-09-05-godot-mcp-2d-power-tools-design.md`

## Global Constraints

- Godot 4.x only; real acceptance gate targets Godot 4.6.3.
- Do not add AnimatedSprite2D, Navigation2D, shaders/materials, 3D, or physics-body motion helpers.
- Keep generic `node.*`, `object.*`, and `resource.*` tools as fallbacks.
- Every mutation is one editor Undo/Redo action with the target node as custom context.
- Only `sprite2d.set_texture.texture_path` is a filesystem path for ToolPolicy fingerprinting.
- Preserve `exactOptionalPropertyTypes`; use the existing `omitUndefinedValues` boundary helper.
- Write regression/contract tests before production changes.

---

### Task 1: Protocol, registration, policy, and RPC wiring

**Files:**
- Create: `packages/protocol/src/power2d.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/protocol/test/power2d.test.ts`
- Create: `packages/server/src/tools/power2d-tools.ts`
- Create: `packages/server/src/mcp/register-power2d-tools.ts`
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/src/security/tool-policy.ts`
- Modify: `packages/server/test/mcp-server.test.ts`
- Create: `packages/server/test/power2d-tools.test.ts`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`

**Interfaces:**
- Produces schemas and result interfaces for all 11 tools.
- Produces typed forwarders `inspectNode2dTransform`, `setNode2dTransform`, `inspectSprite2d`, `setSprite2dTexture`, `configureSprite2d`, `inspectCamera2d`, `configureCamera2d`, `inspectCollision2d`, `setCollision2dShape`, `inspectParallax2d`, `configureParallax2d`.

- [ ] **Step 1: Write protocol and registrar tests that name all 11 tools and validate key schema guards.**

```ts
expect(Node2dSetTransformSchema.safeParse({node_path:'/Main/A'}).success).toBe(false);
expect(Sprite2dConfigureSchema.safeParse({node_path:'/Main/S',frame:1,frame_coords:{x:0,y:0}}).success).toBe(false);
expect(Camera2dConfigureSchema.safeParse({node_path:'/Main/C',zoom:{x:0,y:1}}).success).toBe(false);
expect(Collision2dSetShapeSchema.safeParse({node_path:'/Main/C',shape:{kind:'capsule',radius:10,height:10}}).success).toBe(false);
```

- [ ] **Step 2: Verify the new tests fail because contracts/registrars do not exist.**

Run: `npm test --workspace @godot-mcp/protocol -- power2d.test.ts` and `npm test --workspace @godot-mcp/server -- power2d-tools.test.ts`
Expected: FAIL from missing exports/modules.

- [ ] **Step 3: Implement schemas, typed result interfaces, typed RPC forwarders, registrars, create-server registration, tool policy entries, exact MCP tool list, and dispatcher method names.**

Key policy entries:
```ts
READS.add('node2d.inspect_transform');
READS.add('sprite2d.inspect');
READS.add('camera2d.inspect');
READS.add('collision2d.inspect');
READS.add('parallax2d.inspect');
```

`filesystemPathKeys()` must append `texture_path` only for `sprite2d.set_texture`.

- [ ] **Step 4: Run protocol/server unit tests and typecheck.**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/protocol packages/server packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd
git commit -m "feat(power-tools): add 2D MCP contracts"
```

### Task 2: Node2D and Sprite2D addon handlers

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/power2d_handlers.gd`
- Create: `packages/server/test/power2d-addon-contract.test.ts`

**Interfaces:**
- `inspect_node2d_transform(params)` and `set_node2d_transform(params)`.
- `inspect_sprite2d(params)`, `set_sprite2d_texture(params)`, `configure_sprite2d(params)`.

- [ ] **Step 1: Write addon contract tests requiring Node2D/Sprite2D type guards, custom-context Undo/Redo, texture type checking, and prospective frame-grid validation.**

```ts
expect(source).toContain('if not node is Node2D');
expect(source).toContain('undo_redo.create_action');
expect(source).toContain('Texture2D');
expect(source).toContain('FRAME_OUT_OF_RANGE');
```

- [ ] **Step 2: Verify contract test fails because handler does not exist.**

Run: `npm test --workspace @godot-mcp/server -- power2d-addon-contract.test.ts`
Expected: FAIL missing handler.

- [ ] **Step 3: Implement Node2D canonical snapshots and local transform mutation with exact Undo/Redo.**

Snapshot keys: `position`, `rotation_degrees`, `scale`, `skew_degrees`, `global_position`, `global_rotation_degrees`, `global_scale`.

- [ ] **Step 4: Implement Sprite2D inspect, texture assignment/clear, and atomic configure.**

Prospective frame validation must apply requested `hframes`/`vframes` before checking `frame` or `frame_coords`. Store/restore the complete specialized Sprite2D snapshot in Undo/Redo.

- [ ] **Step 5: Run addon contract tests and static Godot syntax gate when available.**

Run: `npm test --workspace @godot-mcp/server -- power2d-addon-contract.test.ts && npm run check:godot`
Expected: PASS in a Godot-enabled environment.

- [ ] **Step 6: Commit.**

```bash
git add packages/godot-addon/addons/godot_mcp/bridge/handlers/power2d_handlers.gd packages/server/test/power2d-addon-contract.test.ts packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd
git commit -m "feat(power-tools): add Node2D and Sprite2D handlers"
```

### Task 3: Camera2D handler

**Files:**
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/handlers/power2d_handlers.gd`
- Modify: `packages/server/test/power2d-addon-contract.test.ts`

**Interfaces:**
- `inspect_camera2d(params)` and `configure_camera2d(params)`.

- [ ] **Step 1: Extend contract tests for Camera2D type guard, prospective limit validation, drag margins, and complete snapshot restore.**

```ts
expect(source).toContain('Camera2D');
expect(source).toContain('CAMERA_LIMITS_INVALID');
expect(source).toContain('set_drag_margin');
```

- [ ] **Step 2: Verify the extended contract test fails before implementation.**

Run: `npm test --workspace @godot-mcp/server -- power2d-addon-contract.test.ts`
Expected: FAIL missing camera markers.

- [ ] **Step 3: Implement Camera2D inspection and atomic configure.**

Validate prospective limits before mutation. Snapshot and restore enabled, zoom, offset, ignore_rotation, limit flags/values, smoothing flags/speeds, drag enabled flags and four margins.

- [ ] **Step 4: Run focused tests/check-addon.**

Run: `npm test --workspace @godot-mcp/server -- power2d-addon-contract.test.ts && npm run check:godot`
Expected: PASS in Godot-enabled environment.

- [ ] **Step 5: Commit.**

```bash
git add packages/godot-addon/addons/godot_mcp/bridge/handlers/power2d_handlers.gd packages/server/test/power2d-addon-contract.test.ts
git commit -m "feat(power-tools): add Camera2D handlers"
```

### Task 4: CollisionShape2D and Parallax2D handlers

**Files:**
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/handlers/power2d_handlers.gd`
- Modify: `packages/server/test/power2d-addon-contract.test.ts`

**Interfaces:**
- `inspect_collision2d(params)` and `set_collision2d_shape(params)`.
- `inspect_parallax2d(params)` and `configure_parallax2d(params)`.

- [ ] **Step 1: Extend contract tests for supported shape resources, null clear, capsule validation, Parallax2D snapshot/restore, and limit validation.**

```ts
expect(source).toContain('RectangleShape2D.new()');
expect(source).toContain('CircleShape2D.new()');
expect(source).toContain('CapsuleShape2D.new()');
expect(source).toContain('Parallax2D');
expect(source).toContain('PARALLAX_LIMITS_INVALID');
```

- [ ] **Step 2: Verify the extended contract test fails before implementation.**

Run: `npm test --workspace @godot-mcp/server -- power2d-addon-contract.test.ts`
Expected: FAIL missing shape/parallax implementation markers.

- [ ] **Step 3: Implement CollisionShape2D inspection and replacement.**

Create fresh embedded RectangleShape2D/CircleShape2D/CapsuleShape2D resources. Reject invalid capsule geometry before construction. Undo restores the previous `Shape2D` object exactly.

- [ ] **Step 4: Implement Parallax2D inspection and atomic configure.**

Snapshot repeat_size, repeat_times, scroll_scale, autoscroll, scroll_offset, screen_offset, follow_viewport, limit_begin and limit_end. Validate prospective limits before mutation.

- [ ] **Step 5: Run focused tests/check-addon.**

Run: `npm test --workspace @godot-mcp/server -- power2d-addon-contract.test.ts && npm run check:godot`
Expected: PASS in Godot-enabled environment.

- [ ] **Step 6: Commit.**

```bash
git add packages/godot-addon/addons/godot_mcp/bridge/handlers/power2d_handlers.gd packages/server/test/power2d-addon-contract.test.ts
git commit -m "feat(power-tools): add collision and parallax handlers"
```

### Task 5: Real Godot vertical slice and public documentation

**Files:**
- Create: `tests/integration/2d-power-tools.test.ts`
- Create: `docs/tools/2d.md`
- Modify: `README.md`

**Interfaces:**
- Exercises all 11 MCP tools against the real addon.

- [ ] **Step 1: Write the real integration test fixture with Node2D, Sprite2D, Camera2D, StaticBody2D/CollisionShape2D, Parallax2D and a small PNG.**

The test must assert transform, sprite, camera, shape replacement with Undo/Redo, parallax state, save/reload persistence, and error guards.

- [ ] **Step 2: Run the integration test and verify RED before the addon is fully wired.**

Run: `npm run test:integration`
Expected before full wiring: FAIL in `2d-power-tools.test.ts`.

- [ ] **Step 3: Complete dispatcher wiring and fix only defects exposed by the E2E.**

No scope expansion; production fixes must correspond to a failing assertion or Godot error from this vertical slice.

- [ ] **Step 4: Add docs with examples and scope limitations.**

Document all 11 tools and explicitly point to generic tools for unsupported advanced properties.

- [ ] **Step 5: Run full acceptance gates.**

```bash
npm run build
npm run typecheck
npm test
npm run check:godot
npm run test:integration
GODOT_RUNTIME_INTEGRATION=1 npm run test:integration:runtime
GODOT_VISUAL_INTEGRATION=1 npm run test:integration:visual
```

Expected: all gates pass in the Windows/Godot 4.6.3 environment.

- [ ] **Step 6: Commit.**

```bash
git add tests/integration/2d-power-tools.test.ts docs/tools/2d.md README.md packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd
git commit -m "test(power-tools): verify 2D vertical slice"
```
