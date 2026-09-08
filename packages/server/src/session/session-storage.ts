import fs from 'node:fs/promises';
import path from 'node:path';
import type { SessionStore } from './session-store.js';

export interface SessionFile {
  path: string;
  size: number;
}

export async function scanSessionStorage(sessions: SessionStore, id: string, quotaBytes: number) {
  const root = await sessions.ensureDirectory(id);
  const pending = [''];
  const files: SessionFile[] = [];
  let observedBytes = 0,
    visited = 0,
    skippedLinks = 0,
    changedDuringScan = 0,
    truncated = false;
  while (pending.length && !truncated) {
    const relative = pending.shift()!;
    let directory;
    try { directory = await fs.opendir(path.join(root, relative)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { changedDuringScan++; continue; }
      throw error;
    }
    for await (const entry of directory) {
      if (++visited > 10000) {
        truncated = true;
        break;
      }
      const value = relative ? relative + '/' + entry.name : entry.name;
      let stat;
      try { stat = await fs.lstat(path.join(root, value)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') { changedDuringScan++; continue; }
        throw error;
      }
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) {
        skippedLinks++;
        continue;
      }
      if (stat.isDirectory()) pending.push(value);
      else if (stat.isFile()) {
        observedBytes += stat.size;
        files.push({ path: value, size: stat.size });
      }
    }
  }
  return {
    observedBytes,
    fileCount: files.length,
    quotaBytes,
    quotaExceeded: observedBytes > quotaBytes,
    truncated,
    skippedLinks,
    changedDuringScan,
    files,
  };
}
