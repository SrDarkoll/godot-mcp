import { createHash } from 'node:crypto';

const MAX_INLINE_VALUE = 160;
const MAX_SUMMARY = 600;
const MAX_TARGET_VALUE = 160;
const MAX_TARGET_SUMMARY = 400;
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


function summarizeTarget(target: string): string {
  const escaped = JSON.stringify(target);
  if (escaped.length <= MAX_TARGET_VALUE) return escaped;
  const preview = JSON.stringify(target.slice(0, 64));
  return `<target length=${target.length} sha256=${digest(target)} preview=${preview}>`;
}

export function approvalTargetSummary(targets: string[]): string {
  if (!targets.length) return 'no explicit target';
  let result = '';
  for (const target of targets) {
    const entry = summarizeTarget(target);
    const candidate = result ? `${result}, ${entry}` : entry;
    if (candidate.length > MAX_TARGET_SUMMARY) {
      const suffix = result ? ', …' : '…';
      return `${result.slice(0, MAX_TARGET_SUMMARY - suffix.length)}${suffix}`;
    }
    result = candidate;
  }
  return result;
}
