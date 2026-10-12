import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { expect, it } from 'vitest';
import { serverStatus, stopServer } from '../src/management/client.js';
import { BridgeDescriptorStore } from '../src/session/bridge-descriptor.js';

it('never contacts a reused port when the descriptor owner is dead, and keeps confirmation identity checks', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stale-management-'));
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>(resolve => server.once('listening', resolve));
  let connections = 0;
  server.on('connection', socket => { connections++; socket.once('message', () => socket.send('{}')); });
  try {
    const port = (server.address() as any).port;
    const sessionId = '2026-10-11T21-00-00-000Z_1234abcd';
    await new BridgeDescriptorStore(root).write({ port, sessionId, token: 'a'.repeat(64) });
    const file = path.join(root, '.godot-mcp/runtime/bridge.json');
    const record = JSON.parse(await fs.readFile(file, 'utf8')); record.pid = 2147483647;
    await fs.writeFile(file, JSON.stringify(record)); const bytes = await fs.readFile(file);
    expect(await serverStatus(root)).toMatchObject({ state: 'offline' });
    expect(await stopServer(root)).toEqual({ stopped: false, sessionId });
    await expect(stopServer(root, { expectedSessionId: 'different' })).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(connections).toBe(0);
    expect(await fs.readFile(file)).toEqual(bytes);
    record.pid = process.pid; await fs.writeFile(file, JSON.stringify(record));
    await expect(serverStatus(root)).rejects.toMatchObject({ code: 'INVALID_MANAGEMENT_RESPONSE' });
    expect(connections).toBe(1);
  } finally {
    for (const client of server.clients) client.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
});
