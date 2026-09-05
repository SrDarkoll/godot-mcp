import { describe, expect, it } from 'vitest';
import {
  VariantSchema,
  encodeVariant,
  decodeVariant,
  type Variant
} from '../src/index.js';

describe('Variant serialization', () => {
  it('validates primitive variants', () => {
    expect(VariantSchema.parse({ type: 'null', value: null })).toEqual({ type: 'null', value: null });
    expect(VariantSchema.parse({ type: 'bool', value: true })).toEqual({ type: 'bool', value: true });
    expect(VariantSchema.parse({ type: 'int', value: 42 })).toEqual({ type: 'int', value: 42 });
    expect(VariantSchema.parse({ type: 'float', value: 3.14 })).toEqual({ type: 'float', value: 3.14 });
    expect(VariantSchema.parse({ type: 'String', value: 'hello' })).toEqual({ type: 'String', value: 'hello' });
    expect(VariantSchema.parse({ type: 'StringName', value: 'my_signal' })).toEqual({ type: 'StringName', value: 'my_signal' });
    expect(VariantSchema.parse({ type: 'NodePath', value: 'Player/Camera' })).toEqual({ type: 'NodePath', value: 'Player/Camera' });
  });

  it('validates vector variants', () => {
    expect(VariantSchema.parse({ type: 'Vector2', value: { x: 1.5, y: 2.5 } })).toEqual({ type: 'Vector2', value: { x: 1.5, y: 2.5 } });
    expect(VariantSchema.parse({ type: 'Vector2i', value: { x: 1, y: 2 } })).toEqual({ type: 'Vector2i', value: { x: 1, y: 2 } });
    expect(VariantSchema.parse({ type: 'Vector3', value: { x: 1, y: 2, z: 3 } })).toEqual({ type: 'Vector3', value: { x: 1, y: 2, z: 3 } });
    expect(VariantSchema.parse({ type: 'Vector3i', value: { x: 1, y: 2, z: 3 } })).toEqual({ type: 'Vector3i', value: { x: 1, y: 2, z: 3 } });
    expect(VariantSchema.parse({ type: 'Vector4', value: { x: 1, y: 2, z: 3, w: 4 } })).toEqual({ type: 'Vector4', value: { x: 1, y: 2, z: 3, w: 4 } });
    expect(VariantSchema.parse({ type: 'Vector4i', value: { x: 1, y: 2, z: 3, w: 4 } })).toEqual({ type: 'Vector4i', value: { x: 1, y: 2, z: 3, w: 4 } });
  });

  it('validates math and transform variants', () => {
    expect(VariantSchema.parse({ type: 'Rect2', value: { x: 0, y: 0, width: 100, height: 50 } })).toBeDefined();
    expect(VariantSchema.parse({ type: 'Rect2i', value: { x: 0, y: 0, width: 100, height: 50 } })).toBeDefined();
    expect(VariantSchema.parse({ type: 'Color', value: { r: 1, g: 0.5, b: 0, a: 1 } })).toBeDefined();
    expect(VariantSchema.parse({ type: 'Quaternion', value: { x: 0, y: 0, z: 0, w: 1 } })).toBeDefined();
    expect(VariantSchema.parse({
      type: 'Basis',
      value: {
        x: { x: 1, y: 0, z: 0 },
        y: { x: 0, y: 1, z: 0 },
        z: { x: 0, y: 0, z: 1 }
      }
    })).toBeDefined();
    expect(VariantSchema.parse({
      type: 'Transform2D',
      value: {
        x: { x: 1, y: 0 },
        y: { x: 0, y: 1 },
        origin: { x: 10, y: 20 }
      }
    })).toBeDefined();
    expect(VariantSchema.parse({
      type: 'Transform3D',
      value: {
        basis: {
          x: { x: 1, y: 0, z: 0 },
          y: { x: 0, y: 1, z: 0 },
          z: { x: 0, y: 0, z: 1 }
        },
        origin: { x: 1, y: 2, z: 3 }
      }
    })).toBeDefined();
  });

  it('validates collections and packed arrays', () => {
    const arr: Variant = {
      type: 'Array',
      value: [{ type: 'int', value: 1 }, { type: 'String', value: 'two' }]
    };
    expect(VariantSchema.parse(arr)).toEqual(arr);

    const dict: Variant = {
      type: 'Dictionary',
      value: [{ key: { type: 'String', value: 'key' }, value: { type: 'int', value: 123 } }]
    };
    expect(VariantSchema.parse(dict)).toEqual(dict);

    expect(VariantSchema.parse({ type: 'PackedByteArray', value: [1, 2, 3] })).toBeDefined();
    expect(VariantSchema.parse({ type: 'PackedInt32Array', value: [10, 20] })).toBeDefined();
    expect(VariantSchema.parse({ type: 'PackedInt64Array', value: [100, 200] })).toBeDefined();
    expect(VariantSchema.parse({ type: 'PackedFloat32Array', value: [1.1, 2.2] })).toBeDefined();
    expect(VariantSchema.parse({ type: 'PackedFloat64Array', value: [3.3, 4.4] })).toBeDefined();
    expect(VariantSchema.parse({ type: 'PackedStringArray', value: ['a', 'b'] })).toBeDefined();
    expect(VariantSchema.parse({ type: 'PackedVector2Array', value: [{ x: 1, y: 2 }] })).toBeDefined();
    expect(VariantSchema.parse({ type: 'PackedVector3Array', value: [{ x: 1, y: 2, z: 3 }] })).toBeDefined();
    expect(VariantSchema.parse({ type: 'PackedColorArray', value: [{ r: 1, g: 1, b: 1, a: 1 }] })).toBeDefined();
  });

  it('validates structured references', () => {
    expect(VariantSchema.parse({ type: 'Resource', value: { path: 'res://icon.svg', type: 'Texture2D' } })).toBeDefined();
    expect(VariantSchema.parse({ type: 'Object', value: { id: 12345, type: 'Camera3D' } })).toBeDefined();
    expect(VariantSchema.parse({ type: 'Node', value: { path: '/root/Main/Player', type: 'CharacterBody2D' } })).toBeDefined();
  });

  it('encodes and decodes JS values conveniently', () => {
    expect(encodeVariant(null)).toEqual({ type: 'null', value: null });
    expect(encodeVariant(true)).toEqual({ type: 'bool', value: true });
    expect(encodeVariant(42)).toEqual({ type: 'int', value: 42 });
    expect(encodeVariant(3.14)).toEqual({ type: 'float', value: 3.14 });
    expect(encodeVariant('test')).toEqual({ type: 'String', value: 'test' });
    expect(decodeVariant({ type: 'int', value: 42 })).toBe(42);
    expect(decodeVariant({ type: 'Vector2', value: { x: 1, y: 2 } })).toEqual({ x: 1, y: 2 });
  });
});