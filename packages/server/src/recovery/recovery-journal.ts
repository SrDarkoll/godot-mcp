import fs from 'node:fs/promises';
import path from 'node:path';
import type { SessionStore } from '../session/session-store.js';
import { secureDirectory } from './project-files.js';
import { BridgeRpcError } from '../bridge/rpc-router.js';

export interface RecoveryIdentity {
  sessionId: string;
  id: string;
}

/** Owns the project publication barrier independently of snapshot contents. */
export class RecoveryJournal {
  constructor(
    private readonly root: string,
    private readonly sessions: SessionStore,
  ) {}

  private file(): string {
    return path.join(this.root, '.godot-mcp/runtime/recovery.json');
  }

  async read(): Promise<RecoveryIdentity | null> {
    try {
      for (const relative of ['.godot-mcp', '.godot-mcp/runtime']) {
        const directory = await fs.lstat(path.join(this.root, relative));
        if (directory.isSymbolicLink() || !directory.isDirectory()) {
          throw new Error('Invalid journal directory');
        }
      }
      const stat = await fs.lstat(this.file());
      if (stat.isSymbolicLink() || stat.nlink > 1 || stat.size > 4096) {
        throw new Error('Invalid journal');
      }
      const value = JSON.parse(await fs.readFile(this.file(), 'utf8'));
      this.sessions.sessionDir(value.sessionId);
      if (!/^[a-f0-9-]{36}$/.test(value.id)) {
        throw new Error('Invalid journal');
      }
      return { sessionId: value.sessionId, id: value.id };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new BridgeRpcError('RECOVERY_REQUIRED', 'Project recovery journal requires inspection');
    }
  }

  async create(identity: RecoveryIdentity): Promise<void> {
    await secureDirectory(this.root, ['.godot-mcp', 'runtime']);
    const handle = await fs.open(this.file(), 'wx');
    try {
      await handle.writeFile(JSON.stringify({ sessionId: identity.sessionId, id: identity.id }));
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async clear(identity: RecoveryIdentity): Promise<void> {
    const journal = await this.read();
    if (!journal) return;
    if (journal.id !== identity.id || journal.sessionId !== identity.sessionId) {
      throw new BridgeRpcError('RECOVERY_CONFLICT', 'Project journal ownership changed');
    }
    await fs.unlink(this.file());
  }
}
