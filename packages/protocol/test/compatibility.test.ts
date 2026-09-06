import { describe, expect, it } from 'vitest';
import { AddonHelloSchema, CompatibilityManifestSchema } from '../src/index.js';

const manifest = {
  schemaVersion: 1 as const,
  engine: {
    major: 4,
    minor: 6,
    patch: 3,
    status: 'stable',
    build: 'official',
    hash: '7d41c59c4',
    string: '4.6.3.stable.official.7d41c59c4'
  },
  capabilities: {
    'navigation.region.2d': { status: 'supported' as const },
    'navigation.agent3d.keep_y_velocity': {
      status: 'restricted' as const,
      reason: 'Only authorable while use_3d_avoidance is false'
    },
    'visual.viewport2d.capture': {
      status: 'unsupported' as const,
      reason: 'Headless editor has no graphical viewport'
    }
  },
  quirks: {
    'navigation.agent3d.keep_y_velocity.hidden_with_3d_avoidance': {
      active: true,
      reason: 'Known Godot 4.6+ property usage behavior'
    }
  }
};

describe('compatibility manifest', () => {
  it('parses structured engine metadata and bounded capability states', () => {
    const parsed = CompatibilityManifestSchema.parse(manifest);
    expect(parsed.engine).toMatchObject({ major: 4, minor: 6, patch: 3, status: 'stable' });
    expect(parsed.capabilities['navigation.region.2d']?.status).toBe('supported');
    expect(parsed.capabilities['navigation.agent3d.keep_y_velocity']?.status).toBe('restricted');
    expect(parsed.capabilities['visual.viewport2d.capture']?.status).toBe('unsupported');
    expect(parsed.quirks['navigation.agent3d.keep_y_velocity.hidden_with_3d_avoidance']?.active).toBe(true);
  });

  it('rejects unknown capability and quirk ids', () => {
    expect(() => CompatibilityManifestSchema.parse({
      ...manifest,
      capabilities: { ...manifest.capabilities, 'arbitrary.classdb.dump': { status: 'supported' } }
    })).toThrow();
    expect(() => CompatibilityManifestSchema.parse({
      ...manifest,
      quirks: { ...manifest.quirks, 'arbitrary.quirk': { active: true } }
    })).toThrow();
  });

  it('keeps compatibility optional on hello while accepting the current manifest', () => {
    const base = {
      type: 'hello' as const,
      token: '0123456789abcdef0123456789abcdef',
      protocol: 1 as const,
      addonVersion: '0.1.0',
      godotVersion: '4.6.3.stable.official.7d41c59c4',
      projectRoot: 'C:/Games/Test',
      capabilities: {
        editor: true,
        runtime: false,
        debugger: false,
        viewport2d: true,
        viewport3d: true,
        undoRedo: true
      }
    };
    expect(AddonHelloSchema.parse(base).compatibility).toBeUndefined();
    expect(AddonHelloSchema.parse({ ...base, compatibility: manifest }).compatibility?.schemaVersion).toBe(1);
  });
});
