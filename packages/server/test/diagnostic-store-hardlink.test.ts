import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, it } from 'vitest';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';
import { DiagnosticStore } from '../src/runtime/diagnostic-store.js';
it('fails closed rather than appending diagnostics through a hard link', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-diagnostics-link-'));
  const session = createSession(root),
    sessions = new SessionStore(root);
  await sessions.create(session);
  const outside = path.join(root, 'outside.log');
  await fs.writeFile(outside, 'private\n');
  const logs = await sessions.ensureDirectory(session.id, 'logs/runtime');
  const runId = '123e4567-e89b-42d3-a456-426614174000';
  await fs.link(outside, path.join(logs, runId + '.jsonl'));
  const store = new DiagnosticStore(sessions, session.id);
  store.register(runId);
  await store.append({
    runId,
    entries: [
      {
        sequence: 1,
        runId,
        kind: 'output',
        stream: 'stdout',
        message: 'must not append',
        timestamp: new Date().toISOString(),
        file: null,
        line: null,
        frames: [],
        truncated: false,
      },
    ],
    dropped: 0,
  });
  expect(store.degraded(runId)).toBe(true);
  expect(await fs.readFile(outside, 'utf8')).toBe('private\n');
});
