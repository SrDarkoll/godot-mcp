import fs from 'node:fs';
import path from 'node:path';
import {describe,expect,it} from 'vitest';

const file=path.resolve(import.meta.dirname,'../../godot-addon/addons/godot_mcp/bridge/handlers/navigation_handlers.gd');

describe('navigation addon contract',()=>{
  it('supports unified region and agent editing with scene-context Undo/Redo',()=>{
    const source=fs.readFileSync(file,'utf8');
    for(const marker of ['NavigationRegion2D','NavigationRegion3D','NavigationAgent2D','NavigationAgent3D','NAVIGATION_TYPE_MISMATCH','NAVIGATION_DIMENSION_MISMATCH'])
      expect(source).toContain(marker);
    expect(source).toContain('undo_redo.create_action(action_name, 0, target_node)');
    expect(source).toContain('Configure Navigation Region');
    expect(source).toContain('Configure Navigation Agent');
  });

  it('uses copy-on-write resources and the modern 2D/3D bake pipeline',()=>{
    const source=fs.readFileSync(file,'utf8');
    for(const marker of [
      'NavigationPolygon.new()','NavigationMesh.new()','duplicate(true)','NavigationMeshSourceGeometryData2D.new()','NavigationMeshSourceGeometryData3D.new()',
      'NavigationServer2D.parse_source_geometry_data','NavigationServer2D.bake_from_source_geometry_data',
      'NavigationServer3D.parse_source_geometry_data','NavigationServer3D.bake_from_source_geometry_data',
      'NAVIGATION_RESOURCE_MISSING','NAVIGATION_SOURCE_ROOT_NOT_FOUND','NAVIGATION_BAKE_FAILED','NAVIGATION_OUTLINES_UNSUPPORTED'
    ]) expect(source).toContain(marker);
    expect(source).toContain('_commit_resource_change');
  });

  it('delegates NavigationAgent3D compatibility semantics to the shared core',()=>{
    const source=fs.readFileSync(file,'utf8');
    expect(source).toContain('_compatibility.status(KEEP_Y_CAPABILITY)');
    expect(source).toContain('_compatibility.quirk_active(KEEP_Y_QUIRK)');
    expect(source).toContain('CAPABILITY_UNAVAILABLE');
    expect(source).toContain('keep_y_velocity is unavailable when use_3d_avoidance is true');
    expect(source).toContain('result.erase("keep_y_velocity")');
    expect(source).toContain('after.keep_y_velocity = true');
    expect(source).not.toContain('Engine.get_version_info');
  });

});
