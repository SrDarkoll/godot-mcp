import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Session } from './session.js';

export class SessionStore {
  constructor(private readonly projectRoot: string) {}

  sessionDir(sessionId: string): string {
    return path.join(this.projectRoot, '.godot-mcp', 'sessions', sessionId);
  }

  async create(session: Session): Promise<void> {
    const dir = this.sessionDir(session.id);
    const dirs = [
      'screenshots/editor',
      'screenshots/game',
      'screenshots/runtime',
      'transactions',
      'checkpoints',
      'logs',
      'events',
      'artifacts'
    ];
    await Promise.all(dirs.map(relative => mkdir(path.join(dir, relative), { recursive: true })));
    const manifest = {
      sessionId: session.id,
      projectRoot: session.projectRoot,
      startedAt: session.startedAt,
      endedAt: null,
      godotVersion: null,
      addonVersion: null,
      protocolVersion: 1,
      screenshots: [],
      transactions: [],
      checkpoints: [],
      errors: [],
      permissionChanges: []
    };
    await writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
}
