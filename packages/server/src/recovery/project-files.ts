import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { RecoveryPathSchema } from '@godot-mcp/protocol';
import { BridgeRpcError } from '../bridge/rpc-router.js';
export function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
export async function secureDirectory(root: string, parts: string[]): Promise<string> {
  let current = await fs.realpath(root);
  for (const part of parts) {
    current = path.join(current, part);
    try {
      await fs.mkdir(current);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    const st = await fs.lstat(current);
    if (!st.isDirectory() || st.isSymbolicLink())
      throw new BridgeRpcError('PATH_OUTSIDE_PROJECT', 'Linked metadata directory rejected');
  }
  return current;
}
export class ProjectFiles {
  constructor(readonly root: string) {}
  async resolve(value: string, createParents = false): Promise<string> {
    if (!RecoveryPathSchema.safeParse(value).success)
      throw new BridgeRpcError('PATH_OUTSIDE_PROJECT', 'Unsafe project path');
    const parts = value.slice(6).split('/');
    let current = await fs.realpath(this.root);
    let missing = false;
    for (let i = 0; i < parts.length; i++) {
      current = path.join(current, parts[i]!);
      if (missing && !createParents) continue;
      let st;
      try {
        st = await fs.lstat(current);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        if (createParents && i < parts.length - 1) {
          await fs.mkdir(current);
          st = await fs.lstat(current);
        } else {
          missing = true;
          continue;
        }
      }
      if (st.isSymbolicLink() || (st.isFile() && st.nlink > 1))
        throw new BridgeRpcError('PATH_OUTSIDE_PROJECT', 'Linked project file rejected');
      if (i < parts.length - 1 ? !st.isDirectory() : !st.isFile())
        throw new BridgeRpcError('PATH_OUTSIDE_PROJECT', 'Expected ordinary project file');
    }
    return current;
  }
  async read(value: string): Promise<Buffer | null> {
    const file = await this.resolve(value);
    try {
      const st = await fs.stat(file);
      if (st.size > 16 * 1024 * 1024)
        throw new BridgeRpcError('SNAPSHOT_TOO_LARGE', 'File exceeds 16 MiB');
      const bytes = await fs.readFile(file);
      if (bytes.length > 16 * 1024 * 1024)
        throw new BridgeRpcError('SNAPSHOT_TOO_LARGE', 'File exceeds 16 MiB');
      return bytes;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
  async fingerprint(value: string): Promise<string | null> {
    const bytes = await this.read(value);
    return bytes === null ? null : hash(bytes);
  }
  async write(value: string, bytes: Buffer | null, expectedHash: string | null): Promise<void> {
    const file = await this.resolve(value, bytes !== null);
    const assertExpected = async () => {
      if ((await this.fingerprint(value)) !== expectedHash)
        throw new BridgeRpcError('RECOVERY_CONFLICT', `File changed before replacement: ${value}`);
    };
    await assertExpected();
    if (bytes === null) {
      if (expectedHash !== null) await fs.unlink(file);
      return;
    }
    const temporary = path.join(path.dirname(file), `.godot-mcp-${randomUUID()}.tmp`);
    let created = false;
    try {
      const handle = await fs.open(temporary, 'wx');
      created = true;
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Recheck after preparing the payload. This is optimistic concurrency,
      // not a filesystem compare-and-swap against non-cooperating writers.
      await assertExpected();
      if (expectedHash === null) {
        try {
          await fs.link(temporary, file);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST')
            throw new BridgeRpcError(
              'RECOVERY_CONFLICT',
              `File appeared before creation: ${value}`,
            );
          throw error;
        }
      } else await fs.rename(temporary, file);
    } finally {
      if (created) await fs.unlink(temporary).catch(() => {});
    }
  }
}
