import { setRecoveryState } from './recovery-state.js';
import {diffTransaction,type DiffOptions} from './transaction-diff.js';
import fs from 'node:fs/promises';
import {
  TransactionBeginSchema,
  type RecoveryRecord,
  type SnapshotEntry,
} from '@godot-mcp/protocol';
import type { Session } from '../session/session.js';
import type { SessionStore } from '../session/session-store.js';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import { ProjectFiles } from './project-files.js';
import { SnapshotStore } from './snapshot-store.js';
import { RecoveryJournal } from './recovery-journal.js';
import { RecoveryValidator, type RecoveryBridge } from './recovery-validator.js';
export class RecoveryService {
  readonly files: ProjectFiles;
  readonly snapshots: SnapshotStore;
  private readonly journal: RecoveryJournal;
  private readonly validator: RecoveryValidator;
  private active: RecoveryRecord | null = null;
  private working: Promise<RecoveryRecord> | null = null;
  constructor(
    readonly session: Session,
    readonly sessions: SessionStore,
    private readonly bridge: RecoveryBridge,
  ) {
    this.files = new ProjectFiles(session.projectRoot);
    this.snapshots = new SnapshotStore(this.files, sessions);
    this.journal = new RecoveryJournal(session.projectRoot, sessions);
    this.validator = new RecoveryValidator(this.files, bridge);
  }
  get activeId(): string | null {
    return this.active?.id ?? null;
  }
  get editorConnected(): boolean {
    return this.bridge.connected;
  }
  async editorState(): Promise<Record<string, unknown>> {
    return this.bridge.connected
      ? ((await this.bridge.rpc.call('recovery.editor_state', {})) as Record<string, unknown>)
      : { path: null };
  }
  async barrier(): Promise<{ sessionId: string; id: string } | null> {
    return this.journal.read();
  }
  private async clearJournal(record: RecoveryRecord): Promise<void> {
    await this.journal.clear(record);
  }
  async requireNoBarrier(): Promise<void> {
    if (await this.barrier())
      throw new BridgeRpcError(
        'RECOVERY_REQUIRED',
        'An unfinished publication requires transaction.recover',
      );
  }
  private async record(record: RecoveryRecord): Promise<void> {
    await this.snapshots.save(record);
    if (record.kind !== 'checkpoint')
      await this.sessions.update(record.sessionId, (m) => ({
        ...m,
        transactions: [
          ...m.transactions.filter((t) => t.id !== record.id),
          {
            id: record.id,
            kind: record.kind,
            label: record.label,
            state: record.state,
            paths: record.before.map((e) => e.path),
            createdAt: record.createdAt,
            validation: record.validation,
          },
        ],
      }));
  }
  private async prepare(paths: string[]): Promise<void> {
    await this.validator.prepare(paths);
  }
  async begin(input: { label: string; paths: string[]; atomic: true }): Promise<RecoveryRecord> {
    TransactionBeginSchema.parse(input);
    if (this.active) throw new BridgeRpcError('TRANSACTION_ACTIVE', 'Another transaction is open');
    await this.requireNoBarrier();
    await this.prepare(input.paths);
    const record = await this.snapshots.create(
      this.session.id,
      input.label,
      input.paths,
      'transaction',
    );
    await this.record(record);
    this.active = record;
    return record;
  }
  private current(id: string): RecoveryRecord {
    if (!this.active || this.active.id !== id || this.active.state !== 'open')
      throw new BridgeRpcError('TRANSACTION_NOT_OPEN', 'Transaction is not open');
    return this.active;
  }
  async write(id: string, value: string, content: string): Promise<RecoveryRecord> {
    const bytes = Buffer.from(content, 'utf8');
    if (bytes.length > 4 * 1024 * 1024)
      throw new BridgeRpcError('STAGE_TOO_LARGE', 'Staged text exceeds 4 MiB');
    return this.stage(id, value, bytes);
  }
  async remove(id: string, value: string): Promise<RecoveryRecord> {
    return this.stage(id, value, null);
  }
  private async stage(id: string, value: string, bytes: Buffer | null): Promise<RecoveryRecord> {
    const record = this.current(id);
    const entry = record.before.find((e) => e.path === value);
    if (!entry) throw new BridgeRpcError('UNDECLARED_PATH', 'File was not declared at begin');
    const next = await this.snapshots.put(record, 'after', value, bytes);
    const staged = [...record.after.filter((e) => e.path !== value), next];
    if (staged.reduce((n, e) => n + e.size, 0) > 128 * 1024 * 1024)
      throw new BridgeRpcError('SNAPSHOT_TOO_LARGE', 'Staged files exceed 128 MiB');
    record.after = staged;
    record.revision++;
    await this.record(record);
    return record;
  }
  async preview(
    id: string,
  ): Promise<{
    id: string;
    revision: number;
    changes: Array<{
      path: string;
      action: string;
      beforeHash: string | null;
      afterHash: string | null;
      size: number;
    }>;
  }> {
    const record = (await this.status(id)) as RecoveryRecord;
    return {
      id,
      revision: record.revision,
      changes: record.after.map((e) => ({
        path: e.path,
        action: !e.exists
          ? 'delete'
          : record.before.find((b) => b.path === e.path)?.exists
            ? 'modify'
            : 'create',
        beforeHash: record.before.find((b) => b.path === e.path)?.hash ?? null,
        afterHash: e.hash,
        size: e.size,
      })),
    };
  }
  async diff(id:string,options:DiffOptions,sessionId=this.session.id){
    return diffTransaction(this.snapshots,await this.snapshots.load(sessionId,id),options);
  }
  async status(
    id?: string,
    sessionId = this.session.id,
  ): Promise<
    RecoveryRecord | { active: null; recovery: { sessionId: string; id: string } | null }
  > {
    if (!id) {
      if (this.active) return this.active;
      return { active: null, recovery: await this.barrier() };
    }
    return this.snapshots.load(sessionId, id);
  }
  async rollback(id: string): Promise<RecoveryRecord> {
    const record = this.current(id);
    setRecoveryState(record, 'rolled_back');
    await this.record(record);
    this.active = null;
    return record;
  }
  private async validate(record: RecoveryRecord): Promise<{ valid: boolean; errors: string[] }> {
    return this.validator.validate(record);
  }
  async commit(id: string): Promise<RecoveryRecord> {
    const record = this.current(id);
    this.validator.requireAvailable(record);
    this.working = this.publish(record, true);
    try {
      return await this.working;
    } finally {
      this.working = null;
    }
  }
  private async publish(record: RecoveryRecord, validate: boolean): Promise<RecoveryRecord> {
    await this.requireNoBarrier();
    await this.prepare(record.before.map((e) => e.path));
    await this.snapshots.assertCurrent(record.before);
    // Read and verify every blob before changing the project.
    const payloads = new Map<string, Buffer | null>();
    for (const e of record.after)
      payloads.set(e.path, await this.snapshots.bytes(record, 'after', e));
    for (const e of record.before) await this.snapshots.bytes(record, 'before', e);
    await this.journal.create(record);
    try {
      setRecoveryState(record, 'applying');
      await this.record(record);
      for (const entry of record.after) {
        const before = record.before.find((item) => item.path === entry.path);
        if (!before)
          throw new BridgeRpcError('UNDECLARED_PATH', 'Publication contains an undeclared path');
        await this.files.write(entry.path, payloads.get(entry.path)!, before.hash);
      }
      record.validation = validate ? await this.validate(record) : null;
      if (record.validation && !record.validation.valid) return await this.compensate(record);
      await this.snapshots.assertCurrent(record.after);
      setRecoveryState(record, 'committed');
      await this.record(record);
      await this.clearJournal(record);
      this.active = null;
      return record;
    } catch (error) {
      if (record.state === 'rolled_back') throw error;
      try {
        record.validation = {
          valid: false,
          errors: [error instanceof Error ? error.message : 'Publication failed'],
        };
        return await this.compensate(record);
      } catch {
        setRecoveryState(record, 'recovery_required');
        await this.record(record).catch(() => {});
        throw new BridgeRpcError(
          'RECOVERY_REQUIRED',
          'Publication could not be compensated; snapshots and journal retained',
        );
      }
    }
  }
  private async compensate(
    record: RecoveryRecord,
    force = false,
    preserved?: SnapshotEntry[],
  ): Promise<RecoveryRecord> {
    await this.prepare(record.before.map((e) => e.path));
    const payloads = new Map<string, Buffer | null>();
    const expected = new Map<string, string | null>();
    for (const entry of record.before) {
      payloads.set(entry.path, await this.snapshots.bytes(record, 'before', entry));
      const current = await this.files.fingerprint(entry.path);
      const after = record.after.find((e) => e.path === entry.path);
      if (force) {
        const backup = preserved?.find((e) => e.path === entry.path);
        if (!backup || current !== backup.hash)
          throw new BridgeRpcError(
            'RECOVERY_CONFLICT',
            `File changed after forced recovery backup: ${entry.path}`,
          );
      } else if (current !== entry.hash && (!after || current !== after.hash)) {
        throw new BridgeRpcError(
          'RECOVERY_CONFLICT',
          `File changed during recovery: ${entry.path}`,
        );
      }
      expected.set(entry.path, current);
    }
    setRecoveryState(record, 'rolling_back');
    await this.record(record);
    for (const entry of record.before)
      if (expected.get(entry.path) !== entry.hash)
        await this.files.write(entry.path, payloads.get(entry.path)!, expected.get(entry.path)!);
    await this.snapshots.assertCurrent(record.before);
    setRecoveryState(record, 'rolled_back');
    await this.record(record);
    await this.clearJournal(record);
    this.active = null;
    return record;
  }
  async recover(sessionId: string, id: string, force = false): Promise<RecoveryRecord> {
    const journal = await this.barrier();
    if (!journal || journal.id !== id || journal.sessionId !== sessionId)
      throw new BridgeRpcError(
        'RECOVERY_CONFLICT',
        'Recovery request does not match the project journal',
      );
    const record = await this.snapshots.load(sessionId, id);
    await this.prepare(record.before.map((e) => e.path));
    for (const entry of record.before) await this.snapshots.bytes(record, 'before', entry);
    let preserved: SnapshotEntry[] | undefined;
    if (force) {
      const paths = record.before.map((e) => e.path);
      const backup = await this.snapshots.create(
        this.session.id,
        'Before forced recovery',
        paths,
        'checkpoint',
      );
      await this.sessions.update(this.session.id, (m) => ({
        ...m,
        checkpoints: [
          ...m.checkpoints,
          { id: backup.id, kind: 'files', label: backup.label, timestamp: backup.createdAt, paths },
        ],
      }));
      preserved = backup.before;
    }
    this.working = this.compensate(record, force, preserved);
    try {
      return await this.working;
    } finally {
      this.working = null;
    }
  }
  async createCheckpoint(label: string, paths: string[]): Promise<RecoveryRecord> {
    await this.requireNoBarrier();
    const record = await this.snapshots.create(this.session.id, label, paths, 'checkpoint');
    await this.sessions.update(this.session.id, (m) => ({
      ...m,
      checkpoints: [
        ...m.checkpoints,
        { id: record.id, kind: 'files', label, timestamp: record.createdAt, paths },
      ],
    }));
    return record;
  }
  async inspectCheckpoint(id: string, sessionId = this.session.id): Promise<RecoveryRecord> {
    const manifest = await this.sessions.read(sessionId);
    if (manifest.checkpoints.some((c) => c.id === id && c.kind === 'visual'))
      throw new BridgeRpcError(
        'CHECKPOINT_NOT_RECOVERABLE',
        'Visual checkpoints reference images, not file snapshots',
      );
    try {
      return await this.snapshots.load(sessionId, id, 'checkpoint');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new BridgeRpcError('CHECKPOINT_NOT_FOUND', 'Checkpoint does not exist');
      throw error;
    }
  }
  async listCheckpoints(sessionId = this.session.id): Promise<RecoveryRecord[]> {
    await this.sessions.read(sessionId);
    const dir = await this.sessions.ensureDirectory(sessionId, 'checkpoints');
    const records: RecoveryRecord[] = [];
    for (const id of await fs.readdir(dir)) {
      if (/^[a-f0-9-]{36}$/.test(id)) {
        try {
          records.push(await this.snapshots.load(sessionId, id, 'checkpoint'));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async restoreCheckpoint(id: string, sessionId = this.session.id): Promise<RecoveryRecord> {
    if (this.active)
      throw new BridgeRpcError('TRANSACTION_ACTIVE', 'Cancel or commit the open transaction first');
    await this.requireNoBarrier();
    const checkpoint = await this.inspectCheckpoint(id, sessionId);
    await this.prepare(checkpoint.before.map((e) => e.path));
    const record = await this.snapshots.create(
      this.session.id,
      `Restore ${checkpoint.label}`.slice(0, 120),
      checkpoint.before.map((e) => e.path),
      'restore',
    );
    for (const entry of checkpoint.before)
      record.after.push(
        await this.snapshots.put(
          record,
          'after',
          entry.path,
          await this.snapshots.bytes(checkpoint, 'before', entry),
        ),
      );
    await this.record(record);
    this.active = record;
    this.working = this.publish(record, false);
    try {
      return await this.working;
    } finally {
      this.working = null;
    }
  }
  async close(): Promise<void> {
    if (this.working) await this.working.catch(() => {});
    if (this.active?.state === 'open') await this.rollback(this.active.id);
  }
}
