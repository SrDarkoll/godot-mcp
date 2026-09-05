import { describe, expect, it } from 'vitest';
import { AddonHelloSchema } from '../src/index.js';

describe('addon hello', () => {
  it('requires project identity and capability flags', () => {
    const hello = AddonHelloSchema.parse({
      type: 'hello',
      token: '0123456789abcdef0123456789abcdef',
      protocol: 1,
      addonVersion: '0.1.0',
      godotVersion: '4.7.2.stable.official',
      projectRoot: 'C:/Games/Test',
      capabilities: {
        editor: true,
        runtime: false,
        debugger: false,
        viewport2d: true,
        viewport3d: true,
        undoRedo: true
      }
    });
    expect(hello.capabilities.editor).toBe(true);
  });
});
