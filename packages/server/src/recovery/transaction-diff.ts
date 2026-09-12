import type { RecoveryRecord } from '@godot-mcp/protocol';
import type { SnapshotStore } from './snapshot-store.js';
export interface DiffOptions {
  redact: boolean;
  context_lines: number;
  max_lines: number;
  max_diff_bytes: number;
}
interface Line {
  kind: ' ' | '-' | '+';
  text: string;
  old: number;
  next: number;
}
function text(bytes: Buffer | null): string | null {
  if (bytes === null) return '';
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
function endings(value: string, bytes: Buffer | null) {
  return {
    lineEnding: value.includes('\r\n')
      ? value.replaceAll('\r\n', '').includes('\n')
        ? 'mixed'
        : 'crlf'
      : value.includes('\n')
        ? 'lf'
        : 'none',
    finalNewline: value.endsWith('\n'),
    utf8Bom: bytes?.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf]))??false,
  };
}
function lines(value: string): string[] {
  if (value === '') return [];
  const result = value.split(/\r?\n/, 20002);
  if (value.endsWith('\n') && result.length < 20002) result.pop();
  return result;
}
function edits(before: string[], after: string[]): Line[] {
  let prefix = 0,
    suffix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
    prefix++;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++;
  const old = before.slice(prefix, before.length - suffix),
    next = after.slice(prefix, after.length - suffix);
  const operations: Array<{ kind: Line['kind']; text: string }> = before
    .slice(0, prefix)
    .map((text) => ({ kind: ' ', text }));
  if ((old.length + 1) * (next.length + 1) <= 4000000) {
    const stride = next.length + 1,
      table = new Uint32Array((old.length + 1) * stride);
    for (let i = old.length - 1; i >= 0; i--)
      for (let j = next.length - 1; j >= 0; j--)
        table[i * stride + j] =
          old[i] === next[j]
            ? table[(i + 1) * stride + j + 1]! + 1
            : Math.max(table[(i + 1) * stride + j]!, table[i * stride + j + 1]!);
    let i = 0,
      j = 0;
    while (i < old.length || j < next.length) {
      if (i < old.length && j < next.length && old[i] === next[j]) {
        operations.push({ kind: ' ', text: old[i++]! });
        j++;
      } else if (
        i < old.length &&
        (j === next.length || table[(i + 1) * stride + j]! >= table[i * stride + j + 1]!)
      )
        operations.push({ kind: '-', text: old[i++]! });
      else operations.push({ kind: '+', text: next[j++]! });
    }
  } else {
    operations.push(
      ...old.map((text) => ({ kind: '-' as const, text })),
      ...next.map((text) => ({ kind: '+' as const, text })),
    );
  }
  operations.push(
    ...before.slice(before.length - suffix).map((text) => ({ kind: ' ' as const, text })),
  );
  let oldLine = 1,
    newLine = 1;
  return operations.map((op) => {
    const result = { ...op, old: oldLine, next: newLine };
    if (op.kind !== '+') oldLine++;
    if (op.kind !== '-') newLine++;
    return result;
  });
}
export async function diffTransaction(
  snapshots: SnapshotStore,
  record: RecoveryRecord,
  options: DiffOptions,
) {
  let remainingLines = options.max_lines,
    remainingBytes = options.max_diff_bytes;
  const files = [];
  for (const after of record.after) {
    const before = record.before.find((entry) => entry.path === after.path)!;
    const a = await snapshots.bytes(record, 'before', before),
      b = await snapshots.bytes(record, 'after', after);
    const old = text(a),
      next = text(b);
    const entry = {
      path: after.path,
      action: !after.exists
        ? 'delete'
        : !before.exists
          ? 'create'
          : after.hash === before.hash
            ? 'unchanged'
            : 'modify',
      beforeHash: before.hash,
      afterHash: after.hash,
      beforeBytes: before.size,
      afterBytes: after.size,
      binary: old === null || next === null,
      redacted: false,
      truncated: false,
      diff: '',
      beforeText: old === null ? null : endings(old,a),
      afterText: next === null ? null : endings(next,b),
    };
    if (old === null || next === null || before.hash === after.hash) {
      files.push(entry);
      continue;
    }
    const left = lines(old),
      right = lines(next);
    if (left.length > 20000 || right.length > 20000) {
      entry.truncated = true;
      files.push({ ...entry, omitted: 'INPUT_LINE_LIMIT' });
      continue;
    }
    const ops = edits(left, right),
      ranges: Array<[number, number]> = [];
    for (let i = 0; i < ops.length; i++)
      if (ops[i]!.kind !== ' ') {
        const start = Math.max(0, i - options.context_lines),
          end = Math.min(ops.length, i + options.context_lines + 1),
          last = ranges.at(-1);
        if (last && start <= last[1]) last[1] = Math.max(last[1], end);
        else ranges.push([start, end]);
      }
    const wholeSensitive =
      /(?:^|\/)(?:\.env(?:\..*)?|credentials\.[^/]+|secrets?\.[^/]+)$/i.test(after.path) ||
      /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(old + next);
    const redact = (line: string) => {
      if (
        options.redact &&
        (wholeSensitive ||
          /(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization|bearer|cookie|credential)(?:\b|_)/i.test(line))
      ) {
        entry.redacted = true;
        return '[REDACTED sensitive line]';
      }
      return line;
    };
    const append = (value: string) => {
      const size = Buffer.byteLength(value + '\n');
      if (remainingLines <= 0 || size > remainingBytes) {
        entry.truncated = true;
        return false;
      }
      entry.diff += value + '\n';
      remainingLines--;
      remainingBytes -= size;
      return true;
    };
    append('--- ' + (before.exists ? 'a/' + after.path.slice(6) : '/dev/null'));
    append('+++ ' + (after.exists ? 'b/' + after.path.slice(6) : '/dev/null'));
    for (const [start, end] of ranges) {
      const chunk = ops.slice(start, end),
        oldCount = chunk.filter((l) => l.kind !== '+').length,
        newCount = chunk.filter((l) => l.kind !== '-').length;
      if (
        !append(
          `@@ -${chunk[0]!.old - (oldCount === 0 ? 1 : 0)},${oldCount} +${chunk[0]!.next - (newCount === 0 ? 1 : 0)},${newCount} @@`,
        )
      )
        break;
      for (const line of chunk) if (!append(line.kind + redact(line.text))) break;
      if (entry.truncated) break;
    }
    files.push(entry);
  }
  return {
    id: record.id,
    sessionId: record.sessionId,
    revision: record.revision,
    format: 'unified-preview',
    redaction: 'heuristic; review before sharing',
    files,
    truncated: files.some((f) => f.truncated),
  };
}
