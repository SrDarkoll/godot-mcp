import WebSocket from 'ws';
import { describe, expect, it } from 'vitest';
import { createSession } from '../src/session/session.js';
import { BridgeServer } from '../src/bridge/bridge-server.js';

async function connect(bridge: BridgeServer, token = 'a'.repeat(64)) {
  const { port } = await bridge.start();
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({
    type: 'hello', token, protocol: 1,
    addonVersion: '0.1.0', godotVersion: '4.7.2.stable.official',
    projectRoot: 'C:/Games/Test',
    capabilities: { editor: true, runtime: false, debugger: false, viewport2d: true, viewport3d: true, undoRedo: true }
  }));
  return ws;
}

describe('BridgeServer', () => {
  it('accepts exactly one authenticated addon for the active project', async () => {
    const session = createSession('C:/Games/Test');
    const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
    const ws = await connect(bridge);
    await bridge.waitUntilConnected(1000);
    expect(bridge.connected).toBe(true);
    expect(session.godotVersion).toContain('4.7.2');
    ws.close();
    await bridge.stop();
  });

  it('correlates responses by request id', async () => {
    const session = createSession('C:/Games/Test');
    const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
    const ws = await connect(bridge);
    await bridge.waitUntilConnected(1000);
    ws.on('message', raw => {
      const req = JSON.parse(raw.toString());
      if (req.id) ws.send(JSON.stringify({ id: req.id, ok: true, result: { name: 'Fixture' } }));
    });
    const result = await bridge.rpc.call('project.info', {});
    expect(result).toEqual({ name: 'Fixture' });
    ws.close();
    await bridge.stop();
  });

  it('times out unanswered rpc calls', async () => {
    const session = createSession('C:/Games/Test');
    const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
    const ws = await connect(bridge);
    await bridge.waitUntilConnected(1000);
    await expect(bridge.rpc.call('project.info', {}, 25)).rejects.toThrow(/timeout/i);
    ws.close();
    await bridge.stop();
  });
});
