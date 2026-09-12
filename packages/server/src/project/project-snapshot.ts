import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { BridgeRpcError } from '../bridge/rpc-router.js';
export async function fileHash(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function snapshotProject(
  root: string,
  destination: string,
  maxBytes: number,
  deadline: number,
) {
  const pending = [''];
  const files: Array<{ path: string; bytes: number; sha256: string }> = [];
  let bytes = 0,
    visited = 0;
  const excluded = new Set([
    '.git',
    '.godot',
    '.godot-mcp',
    '.codex',
    '.agents',
    '.vscode',
    '.idea',
    '.vs',
    '.github',
    'node_modules',
  ]);
  while (pending.length) {
    const relative = pending.shift()!;
    for await (const entry of await fs.opendir(path.join(root, relative))) {
      if (excluded.has(entry.name.toLowerCase())) continue;
      if (++visited > 10000)
        throw new BridgeRpcError('VALIDATION_LIMIT', 'Project inventory exceeds entry limits');
      if (Date.now() > deadline)
        throw new BridgeRpcError(
          'PROCESS_TIMEOUT',
          'Project snapshot exceeded validation deadline',
        );
      const value = relative ? relative + '/' + entry.name : entry.name,
        source = path.join(root, value),
        target = path.join(destination, value);
      const stat = await fs.lstat(source);
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1))
        throw new BridgeRpcError(
          'UNSAFE_PROJECT_PATH',
          `Linked project path cannot be snapshotted: ${value}`,
        );
      if (stat.isDirectory()) {
        if (pending.length + files.length > 10000)
          throw new BridgeRpcError('VALIDATION_LIMIT', 'Project inventory exceeds entry limits');
        await fs.mkdir(target, { recursive: true });
        pending.push(value);
      } else if (stat.isFile()) {
        bytes += stat.size;
        if (files.length >= 4096 || bytes > maxBytes || stat.size > 64 * 1024 * 1024)
          throw new BridgeRpcError(
            'VALIDATION_LIMIT',
            'Project snapshot exceeds file or byte limits',
          );
        await fs.copyFile(source, target);
        const after = await fs.lstat(source);
        if (
          after.size !== stat.size ||
          after.mtimeMs !== stat.mtimeMs ||
          after.ino !== stat.ino ||
          after.isSymbolicLink()
        )
          throw new BridgeRpcError(
            'PROJECT_CHANGED',
            'Project changed while creating validation snapshot',
          );
        files.push({ path: 'res://' + value, bytes: stat.size, sha256: await fileHash(target) });
      }
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, bytes };
}
