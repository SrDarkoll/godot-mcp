import { describe, expect, it } from 'vitest';
import { diffTransaction } from '../src/recovery/transaction-diff.js';
import type { RecoveryRecord } from '@godot-mcp/protocol';

describe('diffTransaction', () => {
  const dummySnapshots = {
    bytes: async (_record: RecoveryRecord, phase: 'before' | 'after', entry: { path: string }) => {
      if (entry.path === 'res://created.gd') {
        return phase === 'before' ? null : Buffer.from('extends Node\r\nfunc _ready():\r\n\tpass\r\n');
      }
      if (entry.path === 'res://deleted.gd') {
        return phase === 'before' ? Buffer.from('old content\n') : null;
      }
      if (entry.path === 'res://modified.gd') {
        return phase === 'before'
          ? Buffer.from('line 1\nline 2\nline 3\n')
          : Buffer.from('line 1\nline 2 changed\nline 3\n');
      }
      if (entry.path === 'res://secret.env') {
        return phase === 'before'
          ? Buffer.from('API_KEY=old123\n')
          : Buffer.from('API_KEY=new456\n');
      }
      if (entry.path === 'res://image.png') {
        // null byte makes it binary
        return phase === 'before'
          ? Buffer.from([0, 1, 2])
          : Buffer.from([0, 1, 3]);
      }
      return null;
    }
  } as any;

  it('generates unified diff for modified files with line endings analysis', async () => {
    const record: RecoveryRecord = {
      id: '12345678-1234-1234-1234-123456789abc',
      sessionId: 'sess-1',
      kind: 'transaction',
      label: 'test diff',
      state: 'open',
      createdAt: new Date().toISOString(),
      revision: 1,
      before: [{ path: 'res://modified.gd', exists: true, hash: 'h1', size: 21, blob: 'b1' }],
      after: [{ path: 'res://modified.gd', exists: true, hash: 'h2', size: 29, blob: 'b2' }],
      validation: null
    };

    const diff = await diffTransaction(dummySnapshots, record, {
      redact: false,
      context_lines: 2,
      max_lines: 100,
      max_diff_bytes: 10000
    });

    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]!.action).toBe('modify');
    expect(diff.files[0]!.binary).toBe(false);
    expect(diff.files[0]!.diff).toContain('--- a/modified.gd');
    expect(diff.files[0]!.diff).toContain('+++ b/modified.gd');
    expect(diff.files[0]!.diff).toContain('-line 2');
    expect(diff.files[0]!.diff).toContain('+line 2 changed');
  });

  it('redacts sensitive credentials when redact option is true', async () => {
    const record: RecoveryRecord = {
      id: '12345678-1234-1234-1234-123456789abc',
      sessionId: 'sess-1',
      kind: 'transaction',
      label: 'test redact',
      state: 'open',
      createdAt: new Date().toISOString(),
      revision: 1,
      before: [{ path: 'res://secret.env', exists: true, hash: 'h1', size: 15, blob: 'b1' }],
      after: [{ path: 'res://secret.env', exists: true, hash: 'h2', size: 15, blob: 'b2' }],
      validation: null
    };

    const diff = await diffTransaction(dummySnapshots, record, {
      redact: true,
      context_lines: 1,
      max_lines: 100,
      max_diff_bytes: 10000
    });

    expect(diff.files[0]!.redacted).toBe(true);
    expect(diff.files[0]!.diff).toContain('[REDACTED sensitive line]');
    expect(diff.files[0]!.diff).not.toContain('new456');
  });

  it('marks binary files correctly without generating text diff', async () => {
    const record: RecoveryRecord = {
      id: '12345678-1234-1234-1234-123456789abc',
      sessionId: 'sess-1',
      kind: 'transaction',
      label: 'test binary',
      state: 'open',
      createdAt: new Date().toISOString(),
      revision: 1,
      before: [{ path: 'res://image.png', exists: true, hash: 'h1', size: 3, blob: 'b1' }],
      after: [{ path: 'res://image.png', exists: true, hash: 'h2', size: 3, blob: 'b2' }],
      validation: null
    };

    const diff = await diffTransaction(dummySnapshots, record, {
      redact: false,
      context_lines: 1,
      max_lines: 100,
      max_diff_bytes: 10000
    });

    expect(diff.files[0]!.binary).toBe(true);
    expect(diff.files[0]!.diff).toBe('');
  });
});
