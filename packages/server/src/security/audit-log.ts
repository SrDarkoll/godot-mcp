import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Risk } from '@godot-mcp/protocol';
import type { SessionStore } from '../session/session-store.js';
import { BridgeRpcError } from '../bridge/rpc-router.js';

export interface AuditOperation {
  tool: string;
  risk: Risk;
  outcome: string;
  targets: string[];
  transactionId: string | null;
  argumentsHash: string;
}
/** Durable append-only operation metadata. Raw arguments/tokens are never accepted. */
export class AuditLog {
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private readonly sessions: SessionStore,
    private readonly sessionId: string,
  ) {}
  async append(operation: AuditOperation): Promise<void> {
    const entry = { id: randomUUID(), timestamp: new Date().toISOString(), ...operation };
    const task = this.queue.then(async () => {
      const directory = await this.sessions.ensureDirectory(this.sessionId, 'logs');
      const file = path.join(directory, 'audit.jsonl');
      try {
        const stat=await fs.lstat(file);
        if (!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1) throw new Error('Linked audit');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const handle = await fs.open(file, 'a');
      try {
        await handle.writeFile(JSON.stringify(entry) + '\n');
        await handle.sync();
      } finally {
        await handle.close();
      }
    });
    this.queue = task.catch(() => {});
    try {
      await task;
    } catch {
      throw new BridgeRpcError('AUDIT_WRITE_FAILED', 'Unable to persist audit record');
    }
  }
  async flush(): Promise<void> {
    await this.queue;
  }
}
