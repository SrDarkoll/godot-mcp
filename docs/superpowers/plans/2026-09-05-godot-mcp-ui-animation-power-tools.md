# Godot MCP UI & Animation Power Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic high-level `ui.*` and `animation.*` editor tools on top of the existing Godot bridge, with Undo/Redo and live Godot 4.6.3 integration coverage.

**Architecture:** Add typed protocol contracts and thin TypeScript forwarding/registering layers, then implement all behavior in two focused GDScript handler objects invoked by the existing dispatcher. Read tools remain normal reads; editor mutations reuse the existing security gate and `EditorUndoRedoManager`.

**Tech Stack:** TypeScript, Zod v4, MCP TypeScript SDK v2, Godot 4.6 GDScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-godot-mcp-ui-animation-power-tools-design.md`

## Global Constraints

- Godot 4.x only; validation target is Godot 4.6.3 stable on Windows.
- No mouse/keyboard automation and no arbitrary GDScript evaluation.
- Existing generic `node.*`, `object.*`, and `resource.*` APIs remain unchanged as fallback.
- All editor mutations use Undo/Redo when available.
- No new dangerous permission; mutations require existing editor/project/local-network permissions.
- Do not add theme tools, AnimationTree tools, audio-track specialization, or editor preview in this plan.
- Do not push, merge, or release.

---

### Task 1: Protocol contracts, forwarding tools, registration, and policy

**Files:**
- Create: `packages/protocol/src/ui.ts`
- Create: `packages/protocol/src/animation.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/protocol/test/ui-animation.test.ts`
- Create: `packages/server/src/tools/ui-tools.ts`
- Create: `packages/server/src/tools/animation-tools.ts`
- Create: `packages/server/src/mcp/register-ui-tools.ts`
- Create: `packages/server/src/mcp/register-animation-tools.ts`
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/src/security/tool-policy.ts`
- Create: `packages/server/test/ui-animation-tools.test.ts`

**Interfaces:**
- Produces typed result interfaces for every tool named in the spec.
- Produces forwarding functions whose RPC method names exactly match the MCP tool names.
- Produces `registerUiTools(registrar, rpc)` and `registerAnimationTools(registrar, rpc)`.

- [ ] **Step 1: Write failing protocol tests**

Add tests that import `UiLayoutPresetSchema`, `UiSizeFlagSchema`, `AnimationTrackTypeSchema`, `AnimationEditableTrackTypeSchema`, and `AnimationLoopModeSchema`, accept all documented values, and reject unknown values.

- [ ] **Step 2: Run the protocol test and verify RED**

Run:

```bash
npm run test --workspace @godot-mcp/protocol -- ui-animation.test.ts
```

Expected: FAIL because `ui.ts` and `animation.ts` do not exist.

- [ ] **Step 3: Add minimal protocol modules and exports**

Implement string-enum schemas plus interfaces for layout inspection/results, animation listing/inspection, track/key descriptions, and mutation result payloads. Re-export them from `packages/protocol/src/index.ts`.

- [ ] **Step 4: Write failing server forwarding/registration tests**

Use a fake `rpc.call` to assert examples such as:

```ts
await inspectUiLayout(rpc, { node_path: '/Main/HUD' });
expect(rpc.call).toHaveBeenCalledWith('ui.inspect_layout', { node_path: '/Main/HUD' });

await createAnimation(rpc, {
  player_path: '/Main/AnimationPlayer',
  animation: 'fade_in',
  length: 0.5
});
expect(rpc.call).toHaveBeenCalledWith('animation.create', expect.objectContaining({ animation: 'fade_in' }));
```

Also assert that the MCP server exposes all 14 new tool names.

- [ ] **Step 5: Run server tests and verify RED**

Run:

```bash
npm run test --workspace @godot-mcp/server -- ui-animation-tools.test.ts
```

Expected: FAIL because forwarding/registrars are missing.

- [ ] **Step 6: Implement forwarding and registrars**

Create thin tool modules and Zod registrations. Use finite numeric validators for anchors/times/ratios. Require at least one field in `ui.set_offsets` and `animation.configure` with schema refinements.

- [ ] **Step 7: Extend security policy**

Add these reads to `READS`:

```text
ui.inspect_layout
animation.list
animation.inspect
```

Add all other new UI/animation tools to `NORMAL_MUTATIONS`.

- [ ] **Step 8: Run focused tests, then build/typecheck**

Run:

```bash
npm run test --workspace @godot-mcp/protocol -- ui-animation.test.ts
npm run test --workspace @godot-mcp/server -- ui-animation-tools.test.ts
npm run build
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/protocol packages/server/src packages/server/test/ui-animation-tools.test.ts
git commit -m "feat(power-tools): add UI and animation MCP contracts"
```

---

### Task 2: UI Control layout handler with Undo/Redo

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/ui_handlers.gd`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`
- Create: `packages/server/test/ui-tools.test.ts`

**Interfaces:**
- Consumes logical node paths from existing editor scene semantics.
- Handles `ui.inspect_layout`, `ui.set_layout_preset`, `ui.set_anchors`, `ui.set_offsets`, `ui.set_size_flags`, `ui.set_focus_neighbor`.
- Every handler returns a plain Dictionary or an existing `{"__error": ...}` envelope.

- [ ] **Step 1: Write failing bridge-level forwarding behavior tests**

Add server tests that validate success/error payloads are forwarded without transformation for all six RPC method names.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
npm run test --workspace @godot-mcp/server -- ui-tools.test.ts
```

Expected: FAIL until the UI tool module/registration from Task 1 is present; when Task 1 is green this test becomes the contract guard for the addon implementation.

- [ ] **Step 3: Implement node resolution and Control validation**

In `ui_handlers.gd`, add helpers:

```gdscript
func _root() -> Node
func _resolve_control(node_path: String)
func _logical_path(root: Node, node: Node) -> String
func _error(code: String, message: String) -> Dictionary
```

`_resolve_control` returns `INVALID_NODE_TYPE` for non-Control nodes and `NODE_NOT_FOUND` for absent paths.

- [ ] **Step 4: Implement `inspect_layout`**

Return all fields in the spec, including `container_managed = control.get_parent() is Container` and normalized size-flag names.

- [ ] **Step 5: Implement layout preset and anchor mutations**

Snapshot all four anchors and offsets before mutation. Use one UndoRedo action per MCP call. Undo must restore the exact eight previous numeric values.

- [ ] **Step 6: Implement offsets and size flags**

For offsets, update only supplied sides but return all four resulting values. For size flags, normalize arrays to bitmasks and store previous horizontal/vertical flags and stretch ratio for Undo.

- [ ] **Step 7: Implement focus neighbor helper**

Resolve the neighbor logical path to a Control, convert it with `control.get_path_to(neighbor)`, and call `set_focus_neighbor`. Empty/null clears to `NodePath("")`. Undo restores the previous NodePath.

- [ ] **Step 8: Wire dispatcher methods**

Instantiate `ui_handlers.gd` in `_init()` and route all six `ui.*` methods.

- [ ] **Step 9: Run addon syntax check**

Run:

```bash
npm run check:godot
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/godot-addon packages/server/test/ui-tools.test.ts
git commit -m "feat(power-tools): add UI layout handlers"
```

---

### Task 3: AnimationMixer/Animation editing handler with Undo/Redo

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/animation_handlers.gd`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`
- Create: `packages/server/test/animation-tools.test.ts`

**Interfaces:**
- Handles `animation.list`, `animation.inspect`, `animation.create`, `animation.remove`, `animation.configure`, `animation.add_track`, `animation.insert_key`, `animation.remove_key`.
- Uses `VariantSerializer.serialize()` for inspected key values and `VariantSerializer.decode()` for inserted key values.

- [ ] **Step 1: Write failing behavior/shape tests**

Add tests that assert all animation forwarding functions use the correct RPC names and keep canonical Variant values intact.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
npm run test --workspace @godot-mcp/server -- animation-tools.test.ts
```

Expected: FAIL before implementation dependencies exist; after Task 1 it becomes a forwarding regression guard.

- [ ] **Step 3: Implement AnimationMixer and library lookup helpers**

Add helpers to resolve the edited-scene node and validate `node is AnimationMixer`. Use default library name `""`. Return `ANIMATION_LIBRARY_NOT_FOUND` or `ANIMATION_NOT_FOUND` as appropriate.

- [ ] **Step 4: Implement `animation.list` and bounded `animation.inspect`**

Map Godot enum constants to documented strings. Inspect every track/key. Count keys before returning; if the total exceeds 2048, return `LIMIT_EXCEEDED`.

- [ ] **Step 5: Implement create/remove/configure with UndoRedo**

For create, create a library when missing and ensure Undo removes that library only when this operation created it. For remove, Undo restores the same Animation resource. For configure, use UndoRedo properties for `length`, `loop_mode`, and `step` only when supplied.

- [ ] **Step 6: Implement `add_track`**

Map string track types to `Animation.TYPE_*`, add at requested position, set path/interpolation/loop-wrap, and Undo with `remove_track(index)`.

- [ ] **Step 7: Implement `insert_key`**

Validate track index and time. Refuse an exact-time existing key with `KEY_EXISTS`. Decode the input Variant, insert the key, and Undo by removing the inserted key at the same time.

- [ ] **Step 8: Implement `remove_key`**

Capture time/value/transition, remove the key, and Undo with `track_insert_key(track, time, value, transition)`.

- [ ] **Step 9: Wire dispatcher and run addon syntax check**

Run:

```bash
npm run check:godot
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/godot-addon packages/server/test/animation-tools.test.ts
git commit -m "feat(power-tools): add animation editing handlers"
```

---

### Task 4: Live Godot vertical slice, persistence, Undo/Redo, and documentation

**Files:**
- Create: `tests/integration/ui-animation-power-tools.test.ts`
- Modify: `scripts/run-integration.mjs`
- Create: `docs/tools/ui-animation.md`
- Modify: `README.md`

**Interfaces:**
- Exercises the public MCP tool surface through the existing stdio + authenticated editor bridge.
- Uses Godot 4.6.3 and the existing fixture/project setup helpers.

- [ ] **Step 1: Write failing integration test**

The test should:

1. Open/create a fixture scene.
2. Create a `Control` root child, a `VBoxContainer`, two `Button` controls, and an `AnimationPlayer` using existing `node.create`.
3. Apply `ui.set_layout_preset(full_rect)` to the UI root.
4. Apply size flags to container/button and focus-neighbor linkage between buttons.
5. Inspect layout and assert container awareness and normalized values.
6. Create animation `fade_in` on the AnimationPlayer.
7. Add a value track targeting the UI root's `modulate:a` or another stable property path.
8. Insert keys at `0.0` and `0.5`, configure length/loop settings, and inspect exact key values.
9. Save and reload the scene.
10. Re-inspect UI and animation to prove persistence.
11. Exercise existing `editor.undo`/`editor.redo` with host approval around one new UI mutation and verify state changes correctly.
12. Assert non-Control and non-AnimationMixer targets return structured errors.

- [ ] **Step 2: Add the integration file to the default integration runner**

Update `scripts/run-integration.mjs` so the new editor mutation vertical slice runs under `npm run test:integration`, not only an opt-in suite.

- [ ] **Step 3: Run integration test and verify RED**

Run:

```bash
npm run test:integration
```

Expected: FAIL until the new addon handlers are complete.

- [ ] **Step 4: Fix only defects exposed by the live test**

Do not add unrelated power tools. Preserve error codes and Undo/Redo semantics from the spec.

- [ ] **Step 5: Document tools**

Write `docs/tools/ui-animation.md` with tool names, arguments, normalized enums, container caveat, animation path examples, Undo/Redo behavior, and exclusions. Add a README link.

- [ ] **Step 6: Run the full gate**

Run:

```bash
npm run build
npm run typecheck
npm test
npm run check:godot
npm run test:integration
$env:GODOT_RUNTIME_INTEGRATION="1"; npm run test:integration:runtime
$env:GODOT_VISUAL_INTEGRATION="1"; npm run test:integration:visual
```

Expected: all suites PASS with zero failures.

- [ ] **Step 7: Commit**

```bash
git add tests/integration scripts/run-integration.mjs docs/tools/ui-animation.md README.md
git commit -m "test(power-tools): verify UI and animation vertical slice"
```
