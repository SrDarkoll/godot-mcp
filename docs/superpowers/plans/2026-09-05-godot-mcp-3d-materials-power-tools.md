# Godot MCP 3D + Materials/Shaders Power Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add specialized, undoable Godot 4.6 tools for common 3D scene authoring, primitive meshes/collisions/lights, StandardMaterial3D, and spatial ShaderMaterial workflows.

**Architecture:** Extend the established protocol → MCP registrar → server forwarder → authenticated bridge RPC → GDScript handler path. Keep 3D scene handlers separate from material/shader handlers, reuse canonical Variant serialization for shader uniforms, and use copy-on-write material mutation to prevent high-level tools from changing shared resources globally.

**Tech Stack:** TypeScript, Zod v4, MCP SDK, Godot 4.6 GDScript, EditorUndoRedoManager, Vitest, live Godot integration tests.

**Spec:** `docs/superpowers/specs/2026-09-05-godot-mcp-3d-materials-power-tools-design.md`

## Global Constraints
- Godot 4.x only; authoritative integration target is Godot 4.6.3.
- No arbitrary GDScript eval.
- Project-scoped security and existing approval model remain unchanged.
- Every editor mutation uses scene-bound Undo/Redo context.
- Primitive resources and new materials/shaders are embedded resources.
- High-level material/shader edits are copy-on-write.
- Node paths are semantic targets; texture paths are filesystem security targets.
- Shader code is limited to 65536 characters and must declare `shader_type spatial;`.

---

### Task 1: Protocol contracts and MCP registration

**Files:**
- Create: `packages/protocol/src/power3d.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/protocol/test/power3d.test.ts`
- Create: `packages/server/src/tools/power3d-tools.ts`
- Create: `packages/server/src/tools/material3d-tools.ts`
- Create: `packages/server/src/mcp/register-power3d-tools.ts`
- Create: `packages/server/src/mcp/register-material3d-tools.ts`
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/src/security/tool-policy.ts`
- Modify: `packages/server/test/mcp-server.test.ts`
- Modify: `packages/server/test/tool-policy.test.ts`
- Create: `packages/server/test/power3d-tools.test.ts`

**Interfaces:**
- Produces the 17 tool schemas and forwarders named in the spec.
- Material target is `{node_path:string, surface_index?:number}` where omitted surface means `material_override`.
- Shader parameter values consume canonical `VariantSchema`.

- [ ] **Step 1: Write protocol and policy tests first**

Add tests that assert:
```ts
expect(Node3dSetTransformSchema.safeParse({
  node_path:'/Main/Model', scale:{x:1,y:0,z:1}
}).success).toBe(false);

expect(Mesh3dSetPrimitiveSchema.safeParse({
  node_path:'/Main/Model', primitive:{kind:'capsule',radius:1,height:1}
}).success).toBe(false);

expect(Shader3dSetCodeSchema.safeParse({
  node_path:'/Main/Model', code:'shader_type spatial; void fragment(){}'
}).success).toBe(true);
```

Add a ToolPolicy regression proving `albedo_texture_path` and `normal_texture_path` are filesystem targets while `node_path` is audit-only semantic context.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:
```bash
npm run test --workspace @godot-mcp/protocol -- power3d.test.ts
npm run test --workspace @godot-mcp/server -- tool-policy.test.ts power3d-tools.test.ts
```
Expected: failure because Phase 3 contracts/tools are not defined.

- [ ] **Step 3: Implement schemas, forwarders, registrars, policy, and exact tool list**

Create Zod schemas for:
```text
node3d.inspect_transform
node3d.set_transform
mesh3d.inspect
mesh3d.set_primitive
camera3d.inspect
camera3d.configure
collision3d.inspect
collision3d.set_shape
light3d.inspect
light3d.configure
material3d.inspect
material3d.set_standard
material3d.configure_standard
material3d.clear
shader3d.inspect
shader3d.set_code
shader3d.set_parameter
```

Register all read-only names in `READS`, all mutation names in `NORMAL_MUTATIONS`, and include material texture path fields in `filesystemPathKeys()`.

- [ ] **Step 4: Run focused tests and static type/syntax gate**

Run the same focused tests, then:
```bash
npm run build
npm run typecheck
```
Expected: PASS in a complete npm environment.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol packages/server
git commit -m "feat(power-tools): add 3D and material MCP contracts"
```

---

### Task 2: 3D scene handlers

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/power3d_handlers.gd`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`
- Create: `packages/server/test/power3d-addon-contract.test.ts`

**Interfaces:**
- Handler methods exactly match the 10 Slice 3A RPC names.
- All mutation actions call `create_action(..., 0, edited_node)`.

- [ ] **Step 1: Write addon contract tests first**

Assert the handler source contains:
```text
inspect_node3d_transform
set_node3d_transform
inspect_mesh3d
set_mesh3d_primitive
inspect_camera3d
configure_camera3d
inspect_collision3d
set_collision3d_shape
inspect_light3d
configure_light3d
```
and contract markers for `BoxMesh`, `SphereMesh`, `CapsuleMesh`, `CylinderMesh`, `PlaneMesh`, `BoxShape3D`, `SphereShape3D`, `CapsuleShape3D`, `CylinderShape3D`, and scene-bound Undo/Redo.

- [ ] **Step 2: Confirm RED with the focused contract test**

Run:
```bash
npm run test --workspace @godot-mcp/server -- power3d-addon-contract.test.ts
```
Expected: failure because the handler does not exist.

- [ ] **Step 3: Implement Node3D, MeshInstance3D, Camera3D, CollisionShape3D, and Light3D handlers**

Key implementation rules:
```gdscript
# Node3D snapshots
{"position":..., "rotation_degrees":..., "scale":...}

# Undo pattern
undo_redo.create_action("Set Node3D Transform", 0, node)
undo_redo.add_do_method(self, "_restore_node3d", node, after)
undo_redo.add_undo_method(self, "_restore_node3d", node, before)

# Primitive mesh replacement
undo_redo.add_do_property(mesh_instance, "mesh", new_mesh)
undo_redo.add_undo_property(mesh_instance, "mesh", previous_mesh)
```

Validate all prospective Camera3D clipping values before applying. Reject subtype-only Light3D fields for the wrong class.

- [ ] **Step 4: Run addon contract test and GDScript static check when Godot is available**

Run:
```bash
npm run test --workspace @godot-mcp/server -- power3d-addon-contract.test.ts
npm run check:godot
```
Expected: contract PASS; Godot syntax PASS in the authoritative environment.

- [ ] **Step 5: Commit**

```bash
git add packages/godot-addon packages/server/test/power3d-addon-contract.test.ts
git commit -m "feat(power-tools): add 3D scene handlers"
```

---

### Task 3: Material and shader handlers

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/material3d_handlers.gd`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`
- Create: `packages/server/test/material3d-addon-contract.test.ts`

**Interfaces:**
- Resolves `material_override` when `surface_index` is absent.
- Resolves surface override when `surface_index` is present and valid.
- Uses `VariantSerializer.serialize/deserialize` for shader uniform values.

- [ ] **Step 1: Write material/shader addon contract tests first**

Require markers for:
```text
StandardMaterial3D
ShaderMaterial
Shader.new()
get_shader_uniform_list
set_shader_parameter
VariantSerializer
set_surface_override_material
material_override
```
Require copy-on-write markers using `duplicate(true)` and Undo/Redo restoring the previous material reference.

- [ ] **Step 2: Confirm RED**

Run:
```bash
npm run test --workspace @godot-mcp/server -- material3d-addon-contract.test.ts
```
Expected: failure because the material handler does not exist.

- [ ] **Step 3: Implement material target resolution and copy-on-write mutations**

Implement:
```text
material3d.inspect
material3d.set_standard
material3d.configure_standard
material3d.clear
shader3d.inspect
shader3d.set_code
shader3d.set_parameter
```

Texture loading must use `ResourceLoader.exists/load` and require `Texture2D`. Standard material properties are applied to a fresh or duplicated StandardMaterial3D. Shader code must be bounded and spatial. `shader3d.set_parameter` validates the uniform name against `get_shader_uniform_list()` before setting it on a duplicated ShaderMaterial.

- [ ] **Step 4: Run focused contract tests and static sweep**

Run:
```bash
npm run test --workspace @godot-mcp/server -- material3d-addon-contract.test.ts
npm run check:godot
```
Expected: contract PASS; Godot syntax PASS in the authoritative environment.

- [ ] **Step 5: Commit**

```bash
git add packages/godot-addon packages/server/test/material3d-addon-contract.test.ts
git commit -m "feat(power-tools): add material and shader handlers"
```

---

### Task 4: Real-Godot vertical slice and docs

**Files:**
- Create: `tests/integration/3d-materials-power-tools.test.ts`
- Create: `docs/tools/3d-materials.md`
- Modify: `README.md`

**Interfaces:**
- Uses the existing editor fixture and MCP stdio helper pattern.
- Exercises every Phase 3 tool at least once.

- [ ] **Step 1: Write the real-Godot E2E before declaring completion**

Build the fixture scene:
```text
Main: Node3D
├── Model: MeshInstance3D
├── Camera: Camera3D
├── Sun: DirectionalLight3D
├── Lamp: OmniLight3D
└── Body: StaticBody3D
    └── Collision: CollisionShape3D
```

Exercise transform → mesh → camera → collision → lights → StandardMaterial3D → surface material → ShaderMaterial → shader uniform → save/reload, with Undo/Redo checks and expected error cases from the spec.

- [ ] **Step 2: Run standard integration and inspect the exact failure/success point**

Run:
```bash
npm run test:integration
```
Expected: the new vertical slice passes together with prior UI/Animation, TileMap/TileSet, and 2D slices.

- [ ] **Step 3: Write public tool documentation**

Document all 17 tools, material slot semantics, copy-on-write behavior, primitive types, shader Variant examples, limits, and out-of-scope cases.

- [ ] **Step 4: Run the full authoritative gates**

```bash
npm run build
npm run typecheck
npm test
npm run check:godot
npm run test:integration
GODOT_RUNTIME_INTEGRATION=1 npm run test:integration:runtime
GODOT_VISUAL_INTEGRATION=1 npm run test:integration:visual
```
Expected: existing runtime remains 10/10 and visual remains 2/2.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/3d-materials-power-tools.test.ts docs/tools/3d-materials.md README.md
git commit -m "test(power-tools): verify 3D and materials vertical slice"
```

---

## Self-review checklist
- Spec coverage: every one of the 17 tools has protocol, registrar, forwarder, dispatcher, handler, policy, unit/contract coverage, and E2E exercise.
- No placeholders or deferred implementation language.
- Material texture paths are filesystem targets; node paths and surface indexes are semantic.
- Copy-on-write is required for both StandardMaterial3D reconfiguration and ShaderMaterial mutations.
- Camera `current` remains inspect-only.
- Imported model authoring and mesh-resource internal surface materials remain out of scope.
