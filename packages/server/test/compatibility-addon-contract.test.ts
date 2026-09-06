import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const addonRoot = path.resolve(process.cwd(), '../godot-addon/addons/godot_mcp/bridge');
const probeFile = path.join(addonRoot, 'compatibility/feature_probe.gd');
const quirksFile = path.join(addonRoot, 'compatibility/quirk_registry.gd');
const coreFile = path.join(addonRoot, 'compatibility/compatibility_core.gd');
const dispatcherFile = path.join(addonRoot, 'rpc_dispatcher.gd');

describe('compatibility addon contract', () => {
  it('uses bounded class, method, property, editor and headless feature probes', () => {
    const source = fs.readFileSync(probeFile, 'utf8');
    expect(source).toContain('ClassDB.class_exists');
    expect(source).toContain('ClassDB.class_has_method');
    expect(source).toContain('ClassDB.class_get_property_list');
    expect(source).toContain('_editor_interface.has_method');
    expect(source).toContain('DisplayServer.get_name() == "headless"');
    expect(source).not.toContain('func probe(params');
  });

  it('centralizes engine version, known quirks and fixed capability ids', () => {
    const core = fs.readFileSync(coreFile, 'utf8');
    const quirks = fs.readFileSync(quirksFile, 'utf8');
    expect(core).toContain('Engine.get_version_info()');
    for (const id of [
      'navigation.region.2d', 'navigation.region.3d',
      'navigation.mesh.bake.2d', 'navigation.mesh.bake.3d',
      'navigation.agent.2d', 'navigation.agent.3d',
      'navigation.agent3d.keep_y_velocity',
      'visual.viewport2d.capture', 'visual.viewport3d.capture'
    ]) expect(core).toContain(id);
    expect(quirks).toContain('navigation.agent3d.keep_y_velocity.hidden_with_3d_avoidance');
    expect(quirks).toContain('minor >= 6');
  });

  it('creates exactly one compatibility core in the dispatcher', () => {
    const source = fs.readFileSync(dispatcherFile, 'utf8');
    expect(source.match(/compatibility_core\.gd"\)\.new\(editor_interface\)/g) ?? []).toHaveLength(1);
    expect(source).toContain('func compatibility_manifest() -> Dictionary:');
  });
});
