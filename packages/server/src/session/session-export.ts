import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { SessionStore } from './session-store.js';
import { scanSessionStorage, type SessionFile } from './session-storage.js';
import { BridgeRpcError } from '../bridge/rpc-router.js';
export interface ExportOptions {
  include_logs: boolean;
  include_screenshots: boolean;
  include_snapshots: boolean;
  max_bytes: number;
}
export async function exportSession(
  sessions: SessionStore,
  sessionId: string,
  metrics: object,
  options: ExportOptions,
) {
  const manifest = Buffer.from(JSON.stringify(await sessions.read(sessionId), null, 2) + '\n');
  const measured = Buffer.from(JSON.stringify(metrics, null, 2) + '\n');
  let selected: SessionFile[] = [];
  if (options.include_logs || options.include_screenshots || options.include_snapshots) {
    const scan = await scanSessionStorage(sessions, sessionId, options.max_bytes);
    if (scan.truncated || scan.changedDuringScan)
      throw new BridgeRpcError('EXPORT_SCAN_LIMIT', 'Session inventory is incomplete');
    if (scan.skippedLinks)
      throw new BridgeRpcError('EXPORT_UNSAFE_PATH', 'Session contains linked artifacts');
    selected = scan.files.filter(
      (file) =>
        (options.include_logs && file.path.startsWith('logs/')) ||
        (options.include_screenshots && file.path.startsWith('screenshots/')) ||
        (options.include_snapshots && /^(transactions|checkpoints)\//.test(file.path)),
    );
  }
  const estimated =
    manifest.length +
    measured.length +
    selected.reduce((n, f) => n + f.size, 0) +
    (selected.length + 2) * 1024 +
    4096;
  if (estimated > options.max_bytes)
    throw new BridgeRpcError(
      'EXPORT_TOO_LARGE',
      'Export exceeds its byte budget; reduce included artifact classes',
    );
  const id = randomUUID(),
    relative = `artifacts/export-${id}`;
  const directory = await sessions.ensureDirectory(sessionId, relative);
  const index: {
    version: number;
    sessionId: string;
    complete: boolean;
    files: Array<{ path: string; bytes: number; sha256: string }>;
    error?: string;
  } = { version: 1, sessionId, complete: false, files: [] };
  const saveIndex = async () => {
    const temporary = path.join(directory, `export-${randomUUID()}.tmp`);
    const handle = await fs.open(temporary, 'wx');
    try {
      await handle.writeFile(JSON.stringify(index, null, 2) + '\n');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, path.join(directory, 'export.json'));
  };
  const save = async (name: string, bytes: Buffer) => {
    const parent = path.posix.dirname(name);
    const output = await sessions.ensureDirectory(
      sessionId,
      parent === '.' ? relative : relative + '/' + parent,
    );
    const handle = await fs.open(path.join(output, path.posix.basename(name)), 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    index.files.push({
      path: name,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  };
  try {
    await saveIndex();
    await save('manifest.json', manifest);
    await save('metrics.json', measured);
    for (const file of selected) {
      const parent = path.posix.dirname(file.path);
      const source = path.join(
        await sessions.ensureDirectory(sessionId, parent),
        path.posix.basename(file.path),
      );
      const stat = await fs.lstat(source);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1 ||
        stat.size !== file.size ||
        stat.size > options.max_bytes
      )
        throw new BridgeRpcError('EXPORT_CHANGED', 'Session artifact changed during export');
      const bytes = await fs.readFile(source);
      if (bytes.length !== file.size)
        throw new BridgeRpcError('EXPORT_CHANGED', 'Session artifact changed during export');
      await save(file.path, bytes);
    }
    index.complete = true;
    await saveIndex();
    return {
      sessionId,
      id,
      path: directory,
      complete: true,
      fileCount: index.files.length,
      dataBytes: index.files.reduce((n, f) => n + f.bytes, 0),
    };
  } catch (error) {
    index.complete = false;
    index.error = 'Export interrupted; existing files retained';
    await saveIndex().catch(() => {});
    throw new BridgeRpcError('EXPORT_FAILED', 'Export interrupted; partial files retained', {
      path: directory,
      cause: error instanceof BridgeRpcError ? error.code : 'IO_ERROR',
    });
  }
}
