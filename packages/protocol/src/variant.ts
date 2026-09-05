import { z } from 'zod/v4';

export const Vector2ValueSchema = z.object({ x: z.number(), y: z.number() });
export const Vector2iValueSchema = z.object({ x: z.number().int(), y: z.number().int() });
export const Vector3ValueSchema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export const Vector3iValueSchema = z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() });
export const Vector4ValueSchema = z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() });
export const Vector4iValueSchema = z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int(), w: z.number().int() });

export const Rect2ValueSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
export const Rect2iValueSchema = z.object({ x: z.number().int(), y: z.number().int(), width: z.number().int(), height: z.number().int() });

export const ColorValueSchema = z.object({ r: z.number(), g: z.number(), b: z.number(), a: z.number().default(1) });
export const QuaternionValueSchema = z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() });

export const BasisValueSchema = z.object({
  x: Vector3ValueSchema,
  y: Vector3ValueSchema,
  z: Vector3ValueSchema
});

export const Transform2DValueSchema = z.object({
  x: Vector2ValueSchema,
  y: Vector2ValueSchema,
  origin: Vector2ValueSchema
});

export const Transform3DValueSchema = z.object({
  basis: BasisValueSchema,
  origin: Vector3ValueSchema
});

export const ResourceRefSchema = z.object({
  path: z.string(),
  type: z.string().default('Resource')
});

export const ObjectRefSchema = z.object({
  id: z.number(),
  type: z.string().default('Object')
});

export const NodeRefSchema = z.object({
  path: z.string(),
  type: z.string().default('Node')
});

export type Variant =
  | { type: 'null'; value: null }
  | { type: 'bool'; value: boolean }
  | { type: 'int'; value: number }
  | { type: 'float'; value: number }
  | { type: 'String'; value: string }
  | { type: 'StringName'; value: string }
  | { type: 'NodePath'; value: string }
  | { type: 'Vector2'; value: z.infer<typeof Vector2ValueSchema> }
  | { type: 'Vector2i'; value: z.infer<typeof Vector2iValueSchema> }
  | { type: 'Vector3'; value: z.infer<typeof Vector3ValueSchema> }
  | { type: 'Vector3i'; value: z.infer<typeof Vector3iValueSchema> }
  | { type: 'Vector4'; value: z.infer<typeof Vector4ValueSchema> }
  | { type: 'Vector4i'; value: z.infer<typeof Vector4iValueSchema> }
  | { type: 'Rect2'; value: z.infer<typeof Rect2ValueSchema> }
  | { type: 'Rect2i'; value: z.infer<typeof Rect2iValueSchema> }
  | { type: 'Color'; value: z.infer<typeof ColorValueSchema> }
  | { type: 'Quaternion'; value: z.infer<typeof QuaternionValueSchema> }
  | { type: 'Basis'; value: z.infer<typeof BasisValueSchema> }
  | { type: 'Transform2D'; value: z.infer<typeof Transform2DValueSchema> }
  | { type: 'Transform3D'; value: z.infer<typeof Transform3DValueSchema> }
  | { type: 'Array'; value: Variant[] }
  | { type: 'Dictionary'; value: Array<{ key: Variant; value: Variant }> }
  | { type: 'PackedByteArray'; value: number[] }
  | { type: 'PackedInt32Array'; value: number[] }
  | { type: 'PackedInt64Array'; value: (number | string)[] }
  | { type: 'PackedFloat32Array'; value: number[] }
  | { type: 'PackedFloat64Array'; value: number[] }
  | { type: 'PackedStringArray'; value: string[] }
  | { type: 'PackedVector2Array'; value: z.infer<typeof Vector2ValueSchema>[] }
  | { type: 'PackedVector3Array'; value: z.infer<typeof Vector3ValueSchema>[] }
  | { type: 'PackedColorArray'; value: z.infer<typeof ColorValueSchema>[] }
  | { type: 'Resource'; value: z.infer<typeof ResourceRefSchema> }
  | { type: 'Object'; value: z.infer<typeof ObjectRefSchema> }
  | { type: 'Node'; value: z.infer<typeof NodeRefSchema> };

export const VariantSchema: z.ZodType<Variant> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('null'), value: z.null() }),
    z.object({ type: z.literal('bool'), value: z.boolean() }),
    z.object({ type: z.literal('int'), value: z.number().int() }),
    z.object({ type: z.literal('float'), value: z.number() }),
    z.object({ type: z.literal('String'), value: z.string() }),
    z.object({ type: z.literal('StringName'), value: z.string() }),
    z.object({ type: z.literal('NodePath'), value: z.string() }),
    z.object({ type: z.literal('Vector2'), value: Vector2ValueSchema }),
    z.object({ type: z.literal('Vector2i'), value: Vector2iValueSchema }),
    z.object({ type: z.literal('Vector3'), value: Vector3ValueSchema }),
    z.object({ type: z.literal('Vector3i'), value: Vector3iValueSchema }),
    z.object({ type: z.literal('Vector4'), value: Vector4ValueSchema }),
    z.object({ type: z.literal('Vector4i'), value: Vector4iValueSchema }),
    z.object({ type: z.literal('Rect2'), value: Rect2ValueSchema }),
    z.object({ type: z.literal('Rect2i'), value: Rect2iValueSchema }),
    z.object({ type: z.literal('Color'), value: ColorValueSchema }),
    z.object({ type: z.literal('Quaternion'), value: QuaternionValueSchema }),
    z.object({ type: z.literal('Basis'), value: BasisValueSchema }),
    z.object({ type: z.literal('Transform2D'), value: Transform2DValueSchema }),
    z.object({ type: z.literal('Transform3D'), value: Transform3DValueSchema }),
    z.object({ type: z.literal('Array'), value: z.array(VariantSchema) }),
    z.object({
      type: z.literal('Dictionary'),
      value: z.array(z.object({ key: VariantSchema, value: VariantSchema }))
    }),
    z.object({ type: z.literal('PackedByteArray'), value: z.array(z.number()) }),
    z.object({ type: z.literal('PackedInt32Array'), value: z.array(z.number().int()) }),
    z.object({ type: z.literal('PackedInt64Array'), value: z.array(z.union([z.number(), z.string()])) }),
    z.object({ type: z.literal('PackedFloat32Array'), value: z.array(z.number()) }),
    z.object({ type: z.literal('PackedFloat64Array'), value: z.array(z.number()) }),
    z.object({ type: z.literal('PackedStringArray'), value: z.array(z.string()) }),
    z.object({ type: z.literal('PackedVector2Array'), value: z.array(Vector2ValueSchema) }),
    z.object({ type: z.literal('PackedVector3Array'), value: z.array(Vector3ValueSchema) }),
    z.object({ type: z.literal('PackedColorArray'), value: z.array(ColorValueSchema) }),
    z.object({ type: z.literal('Resource'), value: ResourceRefSchema }),
    z.object({ type: z.literal('Object'), value: ObjectRefSchema }),
    z.object({ type: z.literal('Node'), value: NodeRefSchema })
  ])
);

export function encodeVariant(val: unknown): Variant {
  if (val === null || val === undefined) return { type: 'null', value: null };
  if (typeof val === 'boolean') return { type: 'bool', value: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { type: 'int', value: val };
    return { type: 'float', value: val };
  }
  if (typeof val === 'string') return { type: 'String', value: val };
  if (Array.isArray(val)) {
    return { type: 'Array', value: val.map(encodeVariant) };
  }
  if (typeof val === 'object') {
    if ('type' in val && typeof (val as { type: unknown }).type === 'string' && 'value' in val) {
      return val as Variant;
    }
    const entries = Object.entries(val).map(([k, v]) => ({
      key: encodeVariant(k),
      value: encodeVariant(v)
    }));
    return { type: 'Dictionary', value: entries };
  }
  return { type: 'String', value: String(val) };
}

export function decodeVariant(v: Variant): unknown {
  switch (v.type) {
    case 'null': return null;
    case 'bool':
    case 'int':
    case 'float':
    case 'String':
    case 'StringName':
    case 'NodePath':
    case 'Vector2':
    case 'Vector2i':
    case 'Vector3':
    case 'Vector3i':
    case 'Vector4':
    case 'Vector4i':
    case 'Rect2':
    case 'Rect2i':
    case 'Color':
    case 'Quaternion':
    case 'Basis':
    case 'Transform2D':
    case 'Transform3D':
    case 'PackedByteArray':
    case 'PackedInt32Array':
    case 'PackedInt64Array':
    case 'PackedFloat32Array':
    case 'PackedFloat64Array':
    case 'PackedStringArray':
    case 'PackedVector2Array':
    case 'PackedVector3Array':
    case 'PackedColorArray':
    case 'Resource':
    case 'Object':
    case 'Node':
      return v.value;
    case 'Array':
      return v.value.map(decodeVariant);
    case 'Dictionary': {
      const obj: Record<string, unknown> = {};
      for (const entry of v.value) {
        const k = decodeVariant(entry.key);
        obj[String(k)] = decodeVariant(entry.value);
      }
      return obj;
    }
  }
}