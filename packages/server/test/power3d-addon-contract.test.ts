import fs from 'node:fs';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
const file=path.resolve(import.meta.dirname,'../../godot-addon/addons/godot_mcp/bridge/handlers/power3d_handlers.gd');

describe('3D addon contract',()=>{
  it('wires all 3D scene handlers and primitive resources',()=>{
    const source=fs.readFileSync(file,'utf8');
    for(const marker of [
      'inspect_node3d_transform','set_node3d_transform','inspect_mesh3d','set_mesh3d_primitive',
      'inspect_camera3d','configure_camera3d','inspect_collision3d','set_collision3d_shape',
      'inspect_light3d','configure_light3d','BoxMesh','SphereMesh','CapsuleMesh','CylinderMesh','PlaneMesh',
      'BoxShape3D','SphereShape3D','CapsuleShape3D','CylinderShape3D'
    ]) expect(source).toContain(marker);
  });
  it('binds mutations to scene Undo/Redo and restores Camera3D projections atomically',()=>{
    const source=fs.readFileSync(file,'utf8');
    expect((source.match(/create_action\(/g)??[]).length).toBeGreaterThanOrEqual(5);
    expect(source).toContain('create_action("Set Node3D Transform", 0, node)');
    expect(source).toContain('create_action("Set Mesh3D Primitive", 0, mesh_instance)');
    expect(source).toContain('create_action("Configure Camera3D", 0, camera)');
    expect(source).toContain('create_action("Set CollisionShape3D Shape", 0, collision)');
    expect(source).toContain('create_action("Configure Light3D", 0, light)');
    expect(source).toContain('camera.set_perspective');
    expect(source).toContain('camera.set_orthogonal');
    expect(source).toContain('camera.set_frustum');
  });

  it('does not use reserved GDScript keywords as parameter names',()=>{
    const source=fs.readFileSync(file,'utf8');
    expect(source).not.toContain('path_str: String, class_name: String');
    expect(source).toContain('expected_class_name: String');
  });
});
