import { BridgeRpcError } from '../bridge/rpc-router.js';
const fail = (): never => {
  throw new BridgeRpcError('BATCH_VALUE_INVALID', 'Malformed encoded Variant value');
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
};
const numbers = (value: unknown, keys: string[]) => {
  const data = object(value);
  for (const key of keys)
    if (data[key] !== undefined && (typeof data[key] !== 'number' || !Number.isFinite(data[key])))
      fail();
};
/** Validate conversion shapes before GDScript constructors receive them. */
export function checkBatchValueShape(entry: Record<string, unknown>, plainVectors: boolean): void {
  const type = entry.type,
    hasValue = Object.hasOwn(entry, 'value');
  const value = entry.value;
  if (hasValue && typeof type === 'string') {
    if (/^(Vector[234]i?|Quaternion)$/.test(type))
      numbers(
        value,
        type.includes('2')
          ? ['x', 'y']
          : type.includes('3')
            ? ['x', 'y', 'z']
            : ['x', 'y', 'z', 'w'],
      );
    else if (type === 'Color') numbers(value, ['r', 'g', 'b', 'a']);
    else if (type === 'Rect2' || type === 'Rect2i') numbers(value, ['x', 'y', 'width', 'height']);
    else if (type === 'Basis') {
      const d = object(value);
      for (const key of ['x', 'y', 'z']) numbers(d[key] ?? {}, ['x', 'y', 'z']);
    } else if (type === 'Transform2D') {
      const d = object(value);
      for (const key of ['x', 'y', 'origin']) numbers(d[key] ?? {}, ['x', 'y']);
    } else if (type === 'Transform3D') {
      const d = object(value),
        basis = object(d.basis ?? {});
      for (const key of ['x', 'y', 'z']) numbers(basis[key] ?? {}, ['x', 'y', 'z']);
      numbers(d.origin ?? {}, ['x', 'y', 'z']);
    } else if (type === 'Resource') {
      if (typeof object(value).path !== 'string') fail();
    } else if (type === 'bool') {
      if (typeof value !== 'boolean') fail();
    } else if (type === 'int' || type === 'float') {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (type === 'int' && !Number.isInteger(value))
      )
        fail();
    } else if (['String', 'StringName', 'NodePath'].includes(type)) {
      if (typeof value !== 'string') fail();
    } else if (type === 'Array' || type.startsWith('Packed')) {
      if (!Array.isArray(value)) fail();
      if (/^Packed(?:Byte|Int32|Int64|Float32|Float64)Array$/.test(type))
        for (const item of value as unknown[])
          if (typeof item !== 'number' || !Number.isFinite(item)) fail();
      if (type === 'PackedStringArray')
        for (const item of value as unknown[]) if (typeof item !== 'string') fail();
      if (
        type === 'PackedVector2Array' ||
        type === 'PackedVector3Array' ||
        type === 'PackedColorArray'
      )
        for (const item of value as unknown[])
          numbers(
            item,
            type === 'PackedVector2Array'
              ? ['x', 'y']
              : type === 'PackedVector3Array'
                ? ['x', 'y', 'z']
                : ['r', 'g', 'b', 'a'],
          );
    } else if (type === 'Dictionary' && !Array.isArray(value)) object(value);
  } else if (plainVectors) {
    if ('x' in entry && 'y' in entry) numbers(entry, ['x', 'y', 'z', 'w', 'width', 'height']);
    else if ('r' in entry && 'g' in entry && 'b' in entry) numbers(entry, ['r', 'g', 'b', 'a']);
  }
}
