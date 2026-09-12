import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  RecoveryRecordSchema,
  RecoveryPathsSchema,
  type RecoveryRecord,
  type SnapshotEntry,
} from '@godot-mcp/protocol';
import type { SessionStore } from '../session/session-store.js';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import { ProjectFiles, hash } from './project-files.js';
export class SnapshotStore {
  constructor(
    readonly files: ProjectFiles,
    readonly sessions: SessionStore,
  ) {}
  async dir(sessionId: string, id: string, kind: RecoveryRecord['kind']): Promise<string> {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new BridgeRpcError('INVALID_REQUEST', 'Invalid snapshot id');
    return this.sessions.ensureDirectory(
      sessionId,
      `${kind === 'checkpoint' ? 'checkpoints' : 'transactions'}/${id}`,
    );
  }
  async save(record: RecoveryRecord): Promise<void> {
    RecoveryRecordSchema.parse(record);
    const dir = await this.dir(record.sessionId, record.id, record.kind);
    const temp = path.join(dir, `record-${randomUUID()}.tmp`);
    const h = await fs.open(temp, 'wx');
    try {
      await h.writeFile(JSON.stringify(record, null, 2) + '\n');
      await h.sync();
    } finally {
      await h.close();
    }
    try {
      await fs.rename(
        temp,
        path.join(dir, record.kind === 'checkpoint' ? 'checkpoint.json' : 'transaction.json'),
      );
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
  }
  async load(
    sessionId: string,
    id: string,
    kind: RecoveryRecord['kind'] = 'transaction',
  ): Promise<RecoveryRecord> {
    const file = path.join(
      await this.dir(sessionId, id, kind),
      kind === 'checkpoint' ? 'checkpoint.json' : 'transaction.json',
    );
    const st = await fs.lstat(file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 1024 * 1024)
      throw new BridgeRpcError('SNAPSHOT_CORRUPT', 'Invalid snapshot index');
    const record = RecoveryRecordSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
    if (
      record.id !== id ||
      record.sessionId !== sessionId ||
      (kind === 'checkpoint') !== (record.kind === 'checkpoint')
    )
      throw new BridgeRpcError('SNAPSHOT_CORRUPT', 'Snapshot identity mismatch');
    RecoveryPathsSchema.parse(record.before.map((e) => e.path));
    return record;
  }
  async put(
    record: RecoveryRecord,
    phase: 'before' | 'after',
    value: string,
    bytes: Buffer | null,
  ): Promise<SnapshotEntry> {
    if (bytes === null) return { path: value, exists: false, hash: null, size: 0, blob: null };
    const dir = await this.dir(record.sessionId, record.id, record.kind);
    await this.sessions.ensureDirectory(
      record.sessionId,
      `${record.kind === 'checkpoint' ? 'checkpoints' : 'transactions'}/${record.id}/${phase}`,
    );
    const blob = randomUUID() + '.bin';
    const h = await fs.open(path.join(dir, phase, blob), 'wx');
    try {
      await h.writeFile(bytes);
      await h.sync();
    } finally {
      await h.close();
    }
    return { path: value, exists: true, hash: hash(bytes), size: bytes.length, blob };
  }
  async bytes(
    record: RecoveryRecord,
    phase: 'before' | 'after',
    entry: SnapshotEntry,
  ): Promise<Buffer | null> {
    if (!entry.exists) return null;
    const dir = await this.sessions.ensureDirectory(
      record.sessionId,
      `${record.kind === 'checkpoint' ? 'checkpoints' : 'transactions'}/${record.id}/${phase}`,
    );
    const file = path.join(dir, entry.blob!);
    const st = await fs.lstat(file);
    if (!st.isFile() || st.isSymbolicLink() || st.nlink > 1 || st.size !== entry.size)
      throw new BridgeRpcError('SNAPSHOT_CORRUPT', 'Snapshot blob changed');
    const data = await fs.readFile(file);
    if (hash(data) !== entry.hash)
      throw new BridgeRpcError('SNAPSHOT_CORRUPT', 'Snapshot checksum mismatch');
    return data;
  }
  async create(
    sessionId: string,
    label: string,
    paths: string[],
    kind: RecoveryRecord['kind'],
  ): Promise<RecoveryRecord> {
    RecoveryPathsSchema.parse(paths);
    const record: RecoveryRecord = {
      id: randomUUID(),
      sessionId,
      kind,
      label,
      state: kind === 'checkpoint' ? 'snapshot' : 'open',
      createdAt: new Date().toISOString(),
      revision: 0,
      before: [],
      after: [],
      validation: null,
    };
    let total = 0;
    for (const value of paths) {
      const bytes = await this.files.read(value);
      total += bytes?.length ?? 0;
      if (total > 128 * 1024 * 1024)
        throw new BridgeRpcError('SNAPSHOT_TOO_LARGE', 'Snapshot exceeds 128 MiB');
      record.before.push(await this.put(record, 'before', value, bytes));
    }
    await this.save(record);
    return record;
  }
  async assertCurrent(entries: SnapshotEntry[]): Promise<void> {
    for (const entry of entries)
      if ((await this.files.fingerprint(entry.path)) !== entry.hash)
        throw new BridgeRpcError(
          'RECOVERY_CONFLICT',
          `File changed outside the operation: ${entry.path}`,
        );
  }
}
