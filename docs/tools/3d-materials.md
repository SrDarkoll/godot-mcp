# 3D and materials power tools

Godot MCP provides focused Godot 4.x helpers for common 3D authoring and embedded materials. They complement the generic `node.*`, `object.*`, and `resource.*` tools; unsupported advanced engine properties still have the generic fallback.

## Node3D and primitive meshes

| Tool | Purpose |
| --- | --- |
| `node3d.inspect_transform` | Inspect local and global 3D transform values. |
| `node3d.set_transform` | Atomically set local position, Euler rotation in degrees, and/or stable scale. |
| `mesh3d.inspect` | Inspect a MeshInstance3D, surface count, and recognized primitive mesh details. |
| `mesh3d.set_primitive` | Replace or clear the mesh with an embedded box, sphere, capsule, cylinder, or plane. |

Node3D scale components must be non-zero and either all positive or all negative. This avoids unstable transform decomposition when Godot serializes Node3D transforms.

Primitive examples:

```json
{"kind":"box","size":{"x":2,"y":1,"z":4}}
{"kind":"sphere","radius":1,"height":2,"hemisphere":false}
{"kind":"capsule","radius":0.5,"height":2}
{"kind":"cylinder","top_radius":0.5,"bottom_radius":1,"height":3}
{"kind":"plane","size":{"x":10,"y":10},"orientation":"y"}
```

Pass `primitive: null` to clear the mesh. Mesh replacement is one scene-bound Undo/Redo action and Undo restores the exact previous Mesh resource.

## Camera3D

- `camera3d.inspect`
- `camera3d.configure`

Supported persistent settings are projection (`perspective`, `orthogonal`, `frustum`), FOV/size, near/far clipping, keep-aspect mode, frustum offset, horizontal/vertical offsets, and the 20-bit cull mask. The prospective state must keep `near > 0`, `far > near`, a valid FOV, and positive size.

`current` is inspect-only. The tool does not seize viewport camera ownership.

## CollisionShape3D

- `collision3d.inspect`
- `collision3d.set_shape`

The authoring helper creates embedded `BoxShape3D`, `SphereShape3D`, `CapsuleShape3D`, or `CylinderShape3D` resources. Pass `shape: null` to clear. Capsule height must be at least twice the radius. The helper edits the Shape3D resource rather than applying non-uniform node scaling.

## Light3D

- `light3d.inspect`
- `light3d.configure`

Common fields include color, direct energy, indirect energy, specular contribution, and shadow enablement. Subtype fields are validated:

- OmniLight3D: range and attenuation.
- SpotLight3D: range, attenuation, spot angle, and spot-angle attenuation.
- DirectionalLight3D: directional shadow max distance.

Passing a subtype-only property to the wrong light class returns `INVALID_ARGUMENT`.

## Material targets

Material and shader tools use:

```json
{"node_path":"/Main/Model"}
```

for `GeometryInstance3D.material_override`, or:

```json
{"node_path":"/Main/Model","surface_index":0}
```

for a `MeshInstance3D` surface override. Surface indexes are checked against the active mesh surface count.

## StandardMaterial3D

- `material3d.inspect`
- `material3d.set_standard`
- `material3d.configure_standard`
- `material3d.clear`

`set_standard` always creates a fresh embedded StandardMaterial3D. `configure_standard` is copy-on-write: it deep-duplicates the currently selected StandardMaterial3D, changes the duplicate, then swaps the material slot in one Undo/Redo action. This prevents a high-level edit from unexpectedly mutating another node that shares the original material.

Supported fields are albedo color/texture, metallic, roughness, emission enable/color/energy, normal-map enable/texture/scale, cull mode, and transparency mode. Texture paths participate in the project-filesystem security fingerprint and must resolve to Texture2D resources.

## Spatial ShaderMaterial

- `shader3d.inspect`
- `shader3d.set_code`
- `shader3d.set_parameter`

Shader code is limited to 65,536 characters and must declare `shader_type spatial;`. `set_code` creates a fresh ShaderMaterial when needed or copy-on-write duplicates an existing ShaderMaterial/Shader before replacing the slot.

Example:

```json
{
  "node_path":"/Main/Model",
  "code":"shader_type spatial;\nuniform float strength = 0.25;\nvoid fragment(){ ALBEDO = vec3(strength); }"
}
```

Uniform names are case-sensitive and must appear in `Shader.get_shader_uniform_list()`. Parameter values use the MCP canonical Variant representation:

```json
{
  "node_path":"/Main/Model",
  "name":"strength",
  "value":{"type":"float","value":0.8}
}
```

`shader3d.inspect` returns the authored code, spatial mode, a bounded uniform list, and each current parameter serialized with `VariantSerializer`.

Shader parser/compiler diagnostics remain native Godot diagnostics and can be inspected through the existing diagnostic/runtime tools.

## Scope boundaries

This phase does not add imported glTF authoring, ArrayMesh vertex editing, MultiMesh, Skeleton/Skin, WorldEnvironment/GI, first-class external `.tres`/`.gdshader` editing, material `next_pass`, per-instance shader parameter tools, or mutation of materials embedded inside the Mesh resource itself. Generic MCP tools remain the fallback for advanced cases.
