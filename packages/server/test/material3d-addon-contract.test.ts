import fs from 'node:fs';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
const file=path.resolve(import.meta.dirname,'../../godot-addon/addons/godot_mcp/bridge/handlers/material3d_handlers.gd');

describe('3D material addon contract',()=>{
  it('wires standard material and spatial shader operations',()=>{
    const source=fs.readFileSync(file,'utf8');
    for(const marker of [
      'inspect_material3d','set_standard_material3d','configure_standard_material3d','clear_material3d',
      'inspect_shader3d','set_shader3d_code','set_shader3d_parameter',
      'StandardMaterial3D','ShaderMaterial','Shader.new()','VariantSerializer.serialize','VariantSerializer.deserialize',
      'get_shader_uniform_list','set_shader_parameter','set_surface_override_material','material_override',
      'SURFACE_NOT_FOUND','MATERIAL_TYPE_MISMATCH'
    ]) expect(source).toContain(marker);
  });
  it('uses copy-on-write and scene-context Undo/Redo for material mutations',()=>{
    const source=fs.readFileSync(file,'utf8');
    expect(source).toContain('duplicate(true)');
    expect((source.match(/create_action\(/g)??[]).length).toBeGreaterThanOrEqual(1);
    expect(source).toContain('func _commit_material_change(action_name: String, target: Dictionary, next_material: Material) -> void:');
    expect(source).toContain('undo_redo.create_action(action_name, 0, target_node)');
    for(const action of ['Set StandardMaterial3D','Configure StandardMaterial3D','Clear Material3D','Set Shader3D Code','Set Shader3D Parameter'])
      expect(source).toContain(`_commit_material_change("${action}"`);
  });
});
