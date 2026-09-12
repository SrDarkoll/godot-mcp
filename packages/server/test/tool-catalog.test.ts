import { describe, expect, it } from 'vitest';
import { TOOL_CATALOG, TOOL_PROFILES, toolNamesForProfile } from '../src/tooling/tool-catalog.js';

describe('tool catalog', () => {
  it('contains unique tools, always includes full, and has deterministic profile counts', () => {
    const names = TOOL_CATALOG.map(entry => entry.name);
    expect(new Set(names).size).toBe(names.length);
    expect(TOOL_PROFILES).toEqual(['minimal','core','2d','3d','navigation','ui','runtime','full']);
    expect(TOOL_CATALOG.every(entry => entry.profiles.includes('full'))).toBe(true);
    expect(TOOL_CATALOG.every(entry => entry.description.trim().length > 0)).toBe(true);
    expect(Object.fromEntries(TOOL_PROFILES.map(profile => [profile, toolNamesForProfile(profile).length]))).toEqual({
      minimal:5, core:84, '2d':128, '3d':114, navigation:73, ui:88, runtime:52, full:192
    });
  });

  it('keeps specialized profiles focused while full retains every domain', () => {
    const p2d = new Set(toolNamesForProfile('2d'));
    expect(p2d.has('sprite2d.configure')).toBe(true);
    expect(p2d.has('tilemap.set_cell')).toBe(true);
    expect(p2d.has('navigation.mesh.bake')).toBe(true);
    expect(p2d.has('node3d.set_transform')).toBe(false);
    expect(p2d.has('object.call')).toBe(false);

    const p3d = new Set(toolNamesForProfile('3d'));
    expect(p3d.has('mesh3d.set_primitive')).toBe(true);
    expect(p3d.has('material3d.configure_standard')).toBe(true);
    expect(p3d.has('navigation.agent.configure')).toBe(true);
    expect(p3d.has('tilemap.set_cell')).toBe(false);

    const runtime = new Set(toolNamesForProfile('runtime'));
    expect(runtime.has('runtime.scene_tree')).toBe(true);
    expect(runtime.has('debug.errors')).toBe(true);
    expect(runtime.has('workflow.run_check')).toBe(true);
    expect(runtime.has('scene.save')).toBe(false);
    expect(runtime.has('headless.validate_project')).toBe(true);
    expect(runtime.has('headless.get_output')).toBe(true);
    expect(runtime.has('headless.stop')).toBe(true);
    expect(runtime.has('headless.run_scene')).toBe(true);
    const advancedDebuggerTools=[
      'debug.breakpoint.set','debug.breakpoint.remove','debug.breakpoint.list','debug.stack','debug.variables',
      'debug.expand','debug.continue','debug.step_into','debug.step_over','debug.step_out'
    ];
    for(const name of advancedDebuggerTools)expect(runtime.has(name),name).toBe(true);

    for (const profile of ['minimal','core','2d','3d','navigation','ui'] as const) {
      const names=new Set(toolNamesForProfile(profile));
      for(const name of advancedDebuggerTools)expect(names.has(name),`${profile}:${name}`).toBe(false);
      expect(toolNamesForProfile(profile).some(name => name.startsWith('headless.'))).toBe(false);
    }

    expect(TOOL_CATALOG.find(entry => entry.name === 'godot.tools')?.description).toBe('Discover bounded Godot MCP tool metadata and profile membership without exposing tool schemas or handlers.');

    expect(toolNamesForProfile('minimal')).toEqual([
      'godot.capabilities','godot.tools','project.info','scene.get_tree','session.status'
    ]);
  });
});
