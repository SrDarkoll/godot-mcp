# Godot MCP Phase 3 — 3D + Materials/Shaders Power Tools Design

## Status
Approved by the user via the existing roadmap and the explicit instruction to proceed with the next phase.

## Goal
Give MCP clients high-level, undoable Godot 4.6 authoring primitives for common 3D scene construction and material/shader work without wrapping the entire Godot API.

## Principles
- Godot 4.x only; implementation and E2E target Godot 4.6.3.
- Specialized tools complement `node.*`, `object.*`, and `resource.*`; they do not replace generic fallback.
- All editor mutations are normal project-scoped mutations and bind Undo/Redo to the edited scene context.
- Mutations validate the complete prospective state before changing the editor.
- Embedded resources are preferred for primitive meshes, collision shapes, and newly-authored materials/shaders.
- Material/shader edits use copy-on-write: mutate a duplicated material and reassign the target slot so shared/external resources are not changed globally by a high-level tool.
- Exact project file paths are security targets. Node paths and material slot indexes are semantic targets, not filesystem paths.
- No arbitrary GDScript evaluation and no direct RenderingServer escape hatches.

## Slice 3A — 3D Scene Power Tools

### Tools
1. `node3d.inspect_transform`
2. `node3d.set_transform`
3. `mesh3d.inspect`
4. `mesh3d.set_primitive`
5. `camera3d.inspect`
6. `camera3d.configure`
7. `collision3d.inspect`
8. `collision3d.set_shape`
9. `light3d.inspect`
10. `light3d.configure`

### Node3D transforms
`node3d.set_transform` accepts partial local `position`, `rotation_degrees`, and `scale`.

Scale validation follows Godot 4.6 persistence constraints: all components must be finite, non-zero, and have the same sign (all positive or all negative). This avoids unstable transform decomposition after scene reload.

### MeshInstance3D primitives
`mesh3d.set_primitive` accepts `primitive: null` to clear or one of:
- `box`: positive `size: Vector3`
- `sphere`: positive `radius`, positive `height`, optional `hemisphere`
- `capsule`: positive `radius`, `height >= 2 * radius`
- `cylinder`: nonnegative `top_radius`, nonnegative `bottom_radius`, at least one radius > 0, positive `height`
- `plane`: positive `size: Vector2`, orientation `x|y|z`

The tool creates a new embedded PrimitiveMesh and assigns it atomically. Undo restores the exact previous mesh resource.

`mesh3d.inspect` reports mesh type/resource path, surface count, primitive dimensions when recognized, and material-override summary.

### Camera3D
`camera3d.configure` supports persistent local camera settings:
- `projection`: `perspective|orthogonal|frustum`
- `fov`, `size`, `near`, `far`
- `keep_aspect`: `width|height`
- `frustum_offset: Vector2`
- `h_offset`, `v_offset`
- `cull_mask` (20-bit mask)

Prospective validation requires `near > 0`, `far > near`, `1 <= fov < 180`, and `size > 0`.
`current` is inspected but deliberately not authored in this slice because changing the current camera has cross-node viewport side effects that require a separate ownership-aware design.

### CollisionShape3D
`collision3d.set_shape` creates embedded primitive Shape3D resources or clears the shape:
- `box`: positive `size: Vector3`
- `sphere`: positive `radius`
- `capsule`: positive `radius`, `height >= 2 * radius`
- `cylinder`: positive `radius`, positive `height`
- `null`: clear

The node transform is not rescaled by this tool; shape dimensions are edited on the resource, matching Godot's recommendation for collision shapes.

### Light3D
`light3d.configure` operates on DirectionalLight3D, OmniLight3D, and SpotLight3D.
Common fields:
- `color`
- `energy >= 0`
- `indirect_energy >= 0`
- `specular` in `[0,1]`
- `shadow_enabled`

Subtype fields:
- Omni: `range > 0`, `attenuation` in `[0,10]`
- Spot: `range > 0`, `attenuation` in `[0,10]`, `spot_angle` in `(0,90]`, `spot_angle_attenuation` in `[0,10]`
- Directional: `shadow_max_distance > 0`

Passing a subtype-only field to the wrong light class returns `INVALID_ARGUMENT` instead of silently ignoring it.

## Slice 3B — Materials + Shaders

### Material target model
All material/shader tools target a `MeshInstance3D` by `node_path` plus optional `surface_index`.
- no `surface_index`: edit `GeometryInstance3D.material_override`
- with `surface_index`: edit `MeshInstance3D` surface override for that surface

Surface indexes are validated against the current mesh surface count.

### Tools
11. `material3d.inspect`
12. `material3d.set_standard`
13. `material3d.configure_standard`
14. `material3d.clear`
15. `shader3d.inspect`
16. `shader3d.set_code`
17. `shader3d.set_parameter`

### StandardMaterial3D
`material3d.set_standard` creates and assigns a fresh embedded StandardMaterial3D. It may initialize any supported fields.

`material3d.configure_standard` requires the targeted material to be StandardMaterial3D, duplicates it deeply, applies changes to the duplicate, then reassigns the target slot. Undo restores the exact previous material reference.

Supported fields:
- `albedo_color`
- `albedo_texture_path` (project Texture2D path or null)
- `metallic` in `[0,1]`
- `roughness` in `[0,1]`
- `emission_enabled`
- `emission`
- `emission_energy_multiplier >= 0`
- `normal_enabled`
- `normal_texture_path` (project Texture2D path or null)
- `normal_scale >= 0`
- `cull_mode`: `back|front|disabled`
- `transparency`: `disabled|alpha|alpha_scissor|alpha_hash|alpha_depth_pre_pass`

Texture fields are filesystem security targets and must load as Texture2D.

`material3d.clear` assigns null to the selected override slot and supports Undo/Redo.

### ShaderMaterial
`shader3d.set_code` accepts at most 65536 UTF-8 characters and requires a `shader_type spatial;` declaration. It creates a ShaderMaterial+Shader when the target is not already a ShaderMaterial, or copy-on-write duplicates an existing ShaderMaterial before replacing its Shader code.

After assigning code, the handler queries `Shader.get_shader_uniform_list()` so the response exposes the uniforms Godot recognizes. Shader compile/parser diagnostics remain visible through the existing diagnostics/runtime channels; this phase does not invent a second shader compiler.

`shader3d.inspect` returns:
- target slot
- shader code
- shader mode
- bounded uniform metadata (max 256)
- each uniform's current value encoded through the canonical Variant serializer

`shader3d.set_parameter`:
- requires a ShaderMaterial with a Shader
- requires the exact case-sensitive uniform name to exist in `get_shader_uniform_list()`
- accepts canonical `VariantSchema`
- copy-on-write duplicates the material before applying the parameter
- Undo restores the exact previous material reference

## Security
Read-only tools:
- `node3d.inspect_transform`
- `mesh3d.inspect`
- `camera3d.inspect`
- `collision3d.inspect`
- `light3d.inspect`
- `material3d.inspect`
- `shader3d.inspect`

Normal editor mutations:
- all other Phase 3 tools

Filesystem path arguments:
- `material3d.set_standard.albedo_texture_path`
- `material3d.set_standard.normal_texture_path`
- `material3d.configure_standard.albedo_texture_path`
- `material3d.configure_standard.normal_texture_path`

Node paths are semantic audit targets only.

## Limits
- Shader code: 65536 chars.
- Shader uniforms returned: max 256.
- Surface index: 0..1023 at protocol boundary, then validated against actual surface count.
- Camera cull mask: 0..1048575.
- No zero or mixed-sign Node3D scale.

## Out of scope for Phase 3
- Imported glTF/OBJ mesh authoring/import settings.
- ArrayMesh procedural vertex editing.
- MultiMesh/MultiMeshInstance3D.
- Skeleton3D/Skin/bones.
- Environment/WorldEnvironment/post-processing.
- Decals, fog volumes, GI probes.
- Material next-pass chains and per-instance shader parameters.
- Editing materials embedded inside the Mesh resource itself; this phase edits MeshInstance3D overrides only.
- External `.tres`/`.gdshader` authoring as first-class specialized tools (generic resource/file transaction tools remain available).
- Shader language semantic compilation beyond Godot's own Shader resource and diagnostics.

## E2E vertical slice
A real Godot editor fixture will create:

```
Main: Node3D
├── Model: MeshInstance3D
├── Camera: Camera3D
├── Sun: DirectionalLight3D
├── Lamp: OmniLight3D
└── Body: StaticBody3D
    └── Collision: CollisionShape3D
```

The test will:
1. Set/inspect Node3D transform, Undo/Redo it.
2. Assign a BoxMesh, inspect dimensions, replace with SphereMesh, Undo.
3. Configure perspective then orthogonal/frustum-relevant camera state and validate near/far guard.
4. Create box/capsule/sphere/cylinder collision shapes and exercise Undo/Redo.
5. Configure directional and omni lights including subtype validation.
6. Assign StandardMaterial3D on material_override, configure PBR fields with copy-on-write, Undo/Redo.
7. Assign StandardMaterial3D to surface 0 and verify target separation.
8. Replace override with a spatial ShaderMaterial, inspect recognized uniforms, set a Color/float uniform through canonical Variant encoding, Undo/Redo.
9. Save scene, reload it, and verify transform/mesh/camera/light/collision/material/shader persistence.
10. Exercise INVALID_NODE_TYPE, SURFACE_NOT_FOUND, RESOURCE_NOT_FOUND, MATERIAL_TYPE_MISMATCH, UNIFORM_NOT_FOUND, and invalid scale/projection guards.

## Acceptance gates
- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run check:godot`
- `npm run test:integration`
- runtime integration remains 10/10
- visual integration remains 2/2

The user's Windows Godot 4.6.3 environment remains the authoritative Godot gate.
