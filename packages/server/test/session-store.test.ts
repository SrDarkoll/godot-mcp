import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';
import { BridgeDescriptorStore } from '../src/session/bridge-descriptor.js';

describe('session store', () => {
  it('creates persistent session folders and manifest', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'godot-mcp-'));
    const session = createSession(root);
    await new SessionStore(root).create(session);
    const dir = path.join(root, '.godot-mcp', 'sessions', session.id);
    await expect(stat(path.join(dir, 'screenshots', 'editor'))).resolves.toBeDefined();
    await expect(stat(path.join(dir, 'screenshots', 'game'))).resolves.toBeDefined();
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    expect(manifest.sessionId).toBe(session.id);
  });

  it('writes and removes only the ephemeral bridge descriptor', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'godot-mcp-'));
    const store = new BridgeDescriptorStore(root);
    await store.write({ port: 61337, token: 'a'.repeat(64), sessionId: 's1' });
    const descriptor = JSON.parse(await readFile(path.join(root, '.godot-mcp', 'runtime', 'bridge.json'), 'utf8'));
    expect(descriptor).toMatchObject({ host: '127.0.0.1', port: 61337, token: 'a'.repeat(64), protocol: 1 });
    await store.remove();
    await expect(stat(path.join(root, '.godot-mcp', 'runtime', 'bridge.json'))).rejects.toThrow();
  });
});
