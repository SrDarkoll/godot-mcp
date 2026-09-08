import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ensureProjectDirectory } from '@godot-mcp/server/project-config';
import { RecoveryPathSchema } from '@godot-mcp/protocol';

export interface AddonChange {
  relative: string;
  before: Buffer | null;
  after: Buffer;
}

interface Entry {
  relative: string;
  beforeHash: string | null;
  afterHash: string;
}

interface RecordData {
  version: 1;
  id: string;
  createdAt: string;
  state: 'applying' | 'committed' | 'rolled_back';
  fromVersion: string | null;
  toVersion: string | null;
  files: string[];
  entries: Entry[];
}

const digest = (bytes: Buffer | null) =>
  bytes === null ? null : createHash('sha256').update(bytes).digest('hex');

const failure = (message: string) =>
  Object.assign(new Error(message), { code: 'ADDON_RECOVERY_REQUIRED' });

function parts(relative: string): string[] {
  const values = relative.split('/');
  if (relative.length > 1024 || !RecoveryPathSchema.safeParse('res://addon-recovery/' + relative).success) {
    throw failure('Invalid addon recovery path');
  }
  return values;
}

async function fileAt(root: string, prefix: string[], relative: string): Promise<string> {
  const values = parts(relative);
  const name = values.pop()!;
  return path.join(await ensureProjectDirectory(root, [...prefix, ...values]), name);
}

export async function ordinaryBytes(file: string, limit = 16 * 1024 * 1024): Promise<Buffer | null> {
  try {
    const st = await fs.lstat(file);
    if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size > limit) {
      throw failure('Unsafe addon recovery file');
    }
    const bytes = await fs.readFile(file);
    if (bytes.length > limit) throw failure('Oversized addon recovery file');
    return bytes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeExclusive(file: string, bytes: Buffer): Promise<void> {
  const handle = await fs.open(file, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicWrite(file: string, bytes: Buffer): Promise<void> {
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await writeExclusive(temp, bytes);
    await fs.rename(temp, file);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}

function decode(bytes: Buffer | null, id: string): RecordData {
  if (!bytes) throw failure('Addon recovery manifest missing');
  const data = JSON.parse(bytes.toString('utf8')) as RecordData;
  if (
    data?.version !== 1 ||
    data.id !== id ||
    !['applying', 'committed', 'rolled_back'].includes(data.state) ||
    !Array.isArray(data.entries) ||
    data.entries.length > 1024
  ) {
    throw failure('Invalid addon recovery manifest');
  }
  const names = new Set<string>();
  for (const entry of data.entries) {
    if (
      !entry ||
      typeof entry.relative !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.afterHash) ||
      !(entry.beforeHash === null || /^[a-f0-9]{64}$/.test(entry.beforeHash))
    ) {
      throw failure('Invalid addon recovery entry');
    }
    parts(entry.relative);
    const key = entry.relative.toLowerCase();
    if (names.has(key)) throw failure('Duplicate addon recovery path');
    names.add(key);
  }
  return data;
}

export class AddonJournal {
  private constructor(
    private readonly root: string,
    readonly backupPath: string,
    private readonly record: RecordData
  ) {}

  private async journalPath() {
    return fileAt(this.root, ['.godot-mcp', 'runtime'], 'addon-update.json');
  }

  private async save() {
    await atomicWrite(
      path.join(this.backupPath, 'manifest.json'),
      Buffer.from(JSON.stringify(this.record, null, 2))
    );
  }

  private async clear() {
    const file = await this.journalPath();
    const bytes = await ordinaryBytes(file, 4096);
    if (bytes && JSON.parse(bytes.toString()).id !== this.record.id) {
      throw failure('Addon recovery ownership changed');
    }
    if (bytes) await fs.unlink(file);
  }

  static async prepare(
    root: string,
    changes: AddonChange[],
    fromVersion: string | null,
    toVersion: string | null
  ): Promise<AddonJournal> {
    if (
      changes.length > 1024 ||
      changes.reduce((n, e) => n + (e.before?.length ?? 0) + e.after.length, 0) > 128 * 1024 * 1024
    ) {
      throw failure('Addon update exceeds backup limits');
    }
    const id = randomUUID();
    const backupPath = await ensureProjectDirectory(root, ['.godot-mcp', 'addon-backups', id]);
    const record: RecordData = {
      version: 1,
      id,
      createdAt: new Date().toISOString(),
      state: 'applying',
      fromVersion,
      toVersion,
      files: changes.filter((e) => e.before !== null).map((e) => e.relative),
      entries: []
    };
    for (const entry of changes) {
      if (entry.before !== null) {
        await writeExclusive(
          await fileAt(root, ['.godot-mcp', 'addon-backups', id, 'files'], entry.relative),
          entry.before
        );
      }
      await writeExclusive(
        await fileAt(root, ['.godot-mcp', 'addon-backups', id, 'after'], entry.relative),
        entry.after
      );
      record.entries.push({
        relative: entry.relative,
        beforeHash: digest(entry.before),
        afterHash: digest(entry.after)!
      });
    }
    const journal = new AddonJournal(root, backupPath, record);
    await journal.save();
    await writeExclusive(await journal.journalPath(), Buffer.from(JSON.stringify({ version: 1, id })));
    return journal;
  }

  static async recoverPending(root: string): Promise<void> {
    const runtime = await ensureProjectDirectory(root, ['.godot-mcp', 'runtime']);
    const bytes = await ordinaryBytes(path.join(runtime, 'addon-update.json'), 4096);
    if (!bytes) return;
    const marker = JSON.parse(bytes.toString());
    if (marker?.version !== 1 || typeof marker.id !== 'string' || !/^[a-f0-9-]{36}$/.test(marker.id)) {
      throw failure('Invalid addon update journal');
    }
    const backupPath = await ensureProjectDirectory(root, ['.godot-mcp', 'addon-backups', marker.id]);
    const record = decode(await ordinaryBytes(path.join(backupPath, 'manifest.json'), 1024 * 1024), marker.id);
    const journal = new AddonJournal(root, backupPath, record);
    if (record.state === 'applying') await journal.rollback();
    else await journal.clear();
  }

  async publish(): Promise<void> {
    for (const entry of this.record.entries) {
      const file = await fileAt(this.root, ['addons', 'godot_mcp'], entry.relative);
      const payload = await ordinaryBytes(
        await fileAt(this.root, ['.godot-mcp', 'addon-backups', this.record.id, 'after'], entry.relative)
      );
      if (!payload || digest(payload) !== entry.afterHash) {
        throw failure('Addon update blob mismatch');
      }
      if (digest(await ordinaryBytes(file)) !== entry.beforeHash) {
        throw failure('Addon changed during update; journal retained');
      }
      await atomicWrite(file, payload);
    }
    this.record.state = 'committed';
    await this.save();
    await this.clear();
  }

  async rollback(): Promise<void> {
    const restores: Array<{ file: string; bytes: Buffer | null; expected: string | null }> = [];
    for (const entry of this.record.entries) {
      const file = await fileAt(this.root, ['addons', 'godot_mcp'], entry.relative);
      const bytes =
        entry.beforeHash === null
          ? null
          : await ordinaryBytes(
              await fileAt(this.root, ['.godot-mcp', 'addon-backups', this.record.id, 'files'], entry.relative)
            );
      if (digest(bytes) !== entry.beforeHash) {
        throw failure('Addon backup hash mismatch; journal retained');
      }
      const current = digest(await ordinaryBytes(file));
      if (current !== entry.beforeHash && current !== entry.afterHash) {
        throw failure('External addon edit conflicts with recovery; journal retained');
      }
      restores.push({ file, bytes, expected: current });
    }
    for (const restore of restores) {
      if (digest(await ordinaryBytes(restore.file)) !== restore.expected) {
        throw failure('Addon changed during compensation; journal retained');
      }
      if (digest(restore.bytes) === restore.expected) continue;
      if (restore.bytes === null) await fs.unlink(restore.file);
      else await atomicWrite(restore.file, restore.bytes);
    }
    this.record.state = 'rolled_back';
    await this.save();
    await this.clear();
  }
}
