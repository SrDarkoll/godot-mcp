import { connect, createServer, type Server } from 'node:net';
import { realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { BridgeRpcError } from '../bridge/rpc-router.js';

/** Process-lifetime advisory exclusion. No stale PID files are deleted. */
export type LeaseOperation = 'server' | 'project_init' | 'addon_install' | 'addon_update' | 'unknown';
export interface LeaseOwner {
  operation: LeaseOperation;
  pid: number;
  acquiredAt: string;
}
export interface LeaseOptions {
  operation?: LeaseOperation;
  waitMs?: number;
}

function inspectOwner(pipe: string): Promise<LeaseOwner | null> {
  return new Promise(resolve => {
    const socket = connect(pipe);
    let done = false;
    let text = '';
    const finish = (owner: LeaseOwner | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(owner);
    };
    const timer = setTimeout(() => finish(null), 250);
    socket.on('data', chunk => {
      text += chunk.toString();
      if (text.length > 512) finish(null);
    });
    socket.once('end', () => {
      try {
        const value = JSON.parse(text) as LeaseOwner;
        if (!['server', 'project_init', 'addon_install', 'addon_update', 'unknown'].includes(value.operation) ||
            !Number.isSafeInteger(value.pid) || value.pid < 1 ||
            !Number.isFinite(Date.parse(value.acquiredAt))) {
          finish(null);
          return;
        }
        finish(value);
      } catch { finish(null); }
    });
    socket.once('error', () => finish(null));
  });
}
export class ProjectLease {
  private released = false;
  private constructor(private readonly server: Server) {}

  static async acquire(root: string, options: LeaseOptions = {}): Promise<ProjectLease> {
    if (process.platform !== 'win32') {
      throw new BridgeRpcError('UNSUPPORTED_PLATFORM', 'Project maintenance currently requires Windows');
    }
    const waitMs = options.waitMs ?? 0;
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 5000)
      throw new BridgeRpcError('INVALID_ARGUMENT', 'Lease waitMs must be within 0..5000');
    const operation = options.operation ?? 'unknown';
    const canonical = (await realpath(root)).replaceAll('\\', '/').toLowerCase();
    const key = createHash('sha256').update(canonical).digest('hex');
    const pipe = '\\\\.\\pipe\\godot-mcp-project-' + key;
    const started = Date.now();
    for (;;) {
      const owner: LeaseOwner = { operation, pid: process.pid, acquiredAt: new Date().toISOString() };
      const server = createServer(socket => socket.end(JSON.stringify(owner)));
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen({ path: pipe, exclusive: true }, () => {
            server.removeListener('error', reject);
            resolve();
          });
        });
        server.unref();
        return new ProjectLease(server);
      } catch (error) {
        server.close();
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EACCES')
          throw new BridgeRpcError('PROJECT_ACCESS_DENIED', 'Cannot access the project lease pipe');
        if (code !== 'EADDRINUSE') throw error;
        const current = await inspectOwner(pipe);
        const elapsed = Date.now() - started;
        if (current?.operation === 'server' || elapsed >= waitMs) {
          const heldMs = current ? Math.max(0, Date.now() - Date.parse(current.acquiredAt)) : null;
          throw new BridgeRpcError('PROJECT_BUSY',
            current
              ? `Project is held by ${current.operation} for ${Math.round(heldMs! / 1000)} seconds`
              : 'Project lease is occupied; owner could not be identified',
            { owner: current ? { ...current, heldMs } : null, waitedMs: current?.operation === 'server' || waitMs === 0 ? 0 : elapsed });
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(100, waitMs - elapsed)));
      }
    }
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

/** Presence is enough to block mutation; corrupt journals must also be retained. */
export async function requireNoRecoveryJournal(root: string): Promise<void> {
  let current = await realpath(root);
  for (const component of ['.godot-mcp', 'runtime', 'recovery.json']) {
    current = path.join(current, component);
    let entry;
    try {
      entry = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (entry.isSymbolicLink() || component === 'recovery.json' || !entry.isDirectory()) {
      throw new BridgeRpcError('RECOVERY_REQUIRED', 'Resolve the project recovery journal before addon maintenance');
    }
  }
}

export async function requireNoAddonJournal(root: string): Promise<void> {
  let current = await realpath(root);
  for (const component of ['.godot-mcp', 'runtime', 'addon-update.json']) {
    current = path.join(current, component);
    let entry;
    try {
      entry = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (entry.isSymbolicLink() || component === 'addon-update.json' || !entry.isDirectory()) {
      throw new BridgeRpcError(
        'ADDON_RECOVERY_REQUIRED',
        'Run addon update to recover the interrupted addon installation before starting MCP'
      );
    }
  }
}
