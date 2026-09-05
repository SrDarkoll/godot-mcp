import { createHash } from 'node:crypto';

const MAX_INLINE_VALUE = 160;
const MAX_SUMMARY = 600;
const PAYLOAD_KEY = /^(?:code|content|source)$/i;
const SECRET_KEY = /(?:authorization|credential|password|secret|token|api[_-]?key|private[_-]?key)/i;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value) ?? 'null').digest('hex').slice(0, 12);
}

function shape(value: unknown): string {
  if (typeof value === 'string') return `string length=${value.length}`;
  if (Array.isArray(value)) return `array items=${value.length}`;
  if (value && typeof value === 'object') return `object keys=${Object.keys(value).length}`;
  return typeof value;
}

function summarizeValue(key: string, value: unknown): string {
  if (PAYLOAD_KEY.test(key) || SECRET_KEY.test(key)) {
    return `<redacted ${shape(value)} sha256=${digest(value)}>`;
  }
  const serialized = JSON.stringify(value) ?? 'null';
  if (serialized.length <= MAX_INLINE_VALUE) return serialized;
  return `<${shape(value)} sha256=${digest(value)}>`;
}

export function approvalArgumentSummary(args: Record<string, unknown>): string {
  const entries = Object.keys(args)
    .sort()
    .map(key => `${key}=${summarizeValue(key, args[key])}`);
  if (!entries.length) return 'none';

  let result = '';
  for (const entry of entries) {
    const candidate = result ? `${result}; ${entry}` : entry;
    if (candidate.length > MAX_SUMMARY) {
      const suffix = result ? '; …' : '…';
      return `${result.slice(0, MAX_SUMMARY - suffix.length)}${suffix}`;
    }
    result = candidate;
  }
  return result;
}
