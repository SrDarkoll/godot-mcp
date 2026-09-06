import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SessionManifestSchema, type SessionManifest } from '@godot-mcp/protocol';
import type { Session } from './session.js';
import { BridgeRpcError } from '../bridge/rpc-router.js';

export class SessionStore {
  private readonly queues = new Map<string, Promise<unknown>>();
  constructor(private readonly projectRoot: string) {}

  sessionDir(sessionId: string): string {
    if (!/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z_[a-f0-9]{8}$/.test(sessionId)) throw new Error('Invalid session id');
    return path.join(this.projectRoot, '.godot-mcp', 'sessions', sessionId);
  }

  async create(session: Session): Promise<void> {
    await this.enqueue(session.id, async () => {
      const dir = await this.ensureDirectory(session.id);
      for (const relative of ['screenshots/editor','screenshots/game','screenshots/runtime','transactions','checkpoints','logs','logs/headless','events','artifacts']) {
        await this.ensureDirectory(session.id, relative);
      }
      const manifest: SessionManifest = {manifestVersion:1,sessionId:session.id,projectRoot:session.projectRoot,
        startedAt:session.startedAt,endedAt:null,godotVersion:null,addonVersion:null,protocolVersion:1,
        nextScreenshotSequence:1,screenshots:[],transactions:[],checkpoints:[],errors:[],permissionChanges:[],runtimeRuns:[],headlessRuns:[]};
      try {
        const handle = await fs.open(path.join(dir,'manifest.json'),'wx');
        try { await handle.writeFile(`${JSON.stringify(manifest,null,2)}\n`); await handle.sync(); }
        finally { await handle.close(); }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await this.readRaw(session.id);
      }
    });
  }

  // Validate each directory before descending; recursive mkdir can follow junctions.
  async ensureDirectory(sessionId: string, relative = ''): Promise<string> {
    this.sessionDir(sessionId);
    if (relative && !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(relative)) throw new Error('Invalid artifact directory');
    let current = await fs.realpath(this.projectRoot);
    for (const segment of ['.godot-mcp','sessions',sessionId,...relative.split('/').filter(Boolean)]) {
      current = path.join(current,segment);
      try { await fs.mkdir(current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const entry = await fs.lstat(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Session directory must not be a link');
    }
    return current;
  }

  private enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(id) ?? Promise.resolve()).then(task,task);
    this.queues.set(id,result.catch(() => {}));
    return result;
  }

  private async readRaw(id: string): Promise<SessionManifest> {
    const file = path.join(await this.ensureDirectory(id),'manifest.json');
    if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('Manifest must not be a link');
    const value = SessionManifestSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));
    if (value.sessionId !== id || value.projectRoot !== this.projectRoot) throw new Error('Manifest session mismatch');
    return value;
  }

  async read(id: string): Promise<SessionManifest> {
    await this.queues.get(id);
    return this.readRaw(id);
  }

  async update(id: string, mutate: (value: SessionManifest) => SessionManifest): Promise<void> {
    return this.enqueue(id,async () => {
      let temporary: string | undefined;
      try {
        const next = SessionManifestSchema.parse(mutate(await this.readRaw(id)));
        if (next.sessionId !== id || next.projectRoot !== this.projectRoot) throw new Error('Manifest identity cannot change');
        const dir = await this.ensureDirectory(id);
        temporary = path.join(dir,`manifest.${randomUUID()}.tmp`);
        const handle = await fs.open(temporary,'wx');
        try { await handle.writeFile(`${JSON.stringify(next,null,2)}\n`); await handle.sync(); }
        finally { await handle.close(); }
        await fs.rename(temporary,path.join(dir,'manifest.json'));
      } catch { throw new BridgeRpcError('MANIFEST_WRITE_FAILED','Unable to publish session manifest'); }
      finally { if (temporary) await fs.unlink(temporary).catch(() => {}); }
    });
  }

  async finish(id: string, endedAt: string): Promise<void> {
    await this.update(id,m => ({...m,endedAt:m.endedAt ?? endedAt}));
  }

  async flush(): Promise<void> { await Promise.all(this.queues.values()); }
}
