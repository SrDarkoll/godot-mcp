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
  it('accepts only monotonic events for the authenticated MCP session',async()=>{
    const session=createSession('C:/Games/Test');const seen:any[]=[];
    const bridge=new BridgeServer({session,token:'a'.repeat(64),port:0,onRuntimeEvent:e=>seen.push(e)});
    const ws=await connect(bridge);await bridge.waitUntilConnected(1000);
    const message={type:'event',protocol:1,sessionId:session.id,sequence:1,event:'runtime.diagnostics',data:{runId:'123e4567-e89b-42d3-a456-426614174000',entries:[],dropped:0}};
    ws.send(JSON.stringify({...message,sessionId:'wrong'}));ws.send(JSON.stringify(message));ws.send(JSON.stringify(message));
    await new Promise(r=>setTimeout(r,30));expect(seen).toHaveLength(1);
    ws.close();await bridge.stop();
  });
  it('does not expose a connection before authenticated metadata is durable', async () => {
    let release!:()=>void;
    const pending=new Promise<void>(resolve=>{release=resolve;});
    let entered!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const bridge=new BridgeServer({session:createSession('C:/Games/Test'),token:'a'.repeat(64),port:0,
      onAuthenticated:async()=>{entered();await pending;}});
    const ws=await connect(bridge);
    try {
      await started;
      expect(bridge.connected).toBe(false);
      expect(bridge.capabilities).toBeNull();
      await expect(bridge.rpc.call('project.info',{},25)).rejects.toMatchObject({code:'EDITOR_NOT_CONNECTED'});
      release();await bridge.waitUntilConnected(1000);
      expect(bridge.connected).toBe(true);
    } finally {release();ws.close();await bridge.stop();}
  });
  it('publishes authenticated metadata and clears capabilities on disconnect', async () => {
    const session = createSession('C:/Games/Test');
    const versions:string[] = [];
    const bridge = new BridgeServer({session,token:'a'.repeat(64),port:0,onAuthenticated:async hello => { versions.push(hello.godotVersion); }});
    const ws = await connect(bridge);
    await bridge.waitUntilConnected(1000);
    expect(versions).toEqual(['4.7.2.stable.official']);
    expect(bridge.capabilities?.viewport2d).toBe(true);
    ws.close(); await bridge.stop();
    expect(bridge.capabilities).toBeNull();
  });
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

  it('rejects connection with invalid token', async () => {
    const session = createSession('C:/Games/Test');
    const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
    const ws = await connect(bridge, 'b'.repeat(64));
    const closeEvent = await new Promise<{ code: number; reason: string }>(resolve => {
      ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    expect(closeEvent.code).toBe(1008);
    expect(closeEvent.reason).toContain('Authentication failed');
    expect(bridge.connected).toBe(false);
    await bridge.stop();
  });

  it('rejects connection with protocol mismatch', async () => {
    const session = createSession('C:/Games/Test');
    const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
    const { port } = await bridge.start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({
      type: 'hello', token: 'a'.repeat(64), protocol: 999,
      addonVersion: '0.1.0', godotVersion: '4.7.2.stable.official',
      projectRoot: 'C:/Games/Test',
      capabilities: { editor: true, runtime: false, debugger: false, viewport2d: true, viewport3d: true, undoRedo: true }
    }));
    const closeEvent = await new Promise<{ code: number; reason: string }>(resolve => {
      ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    expect(closeEvent.code).toBe(1008);
    expect(closeEvent.reason).toContain('Protocol mismatch');
    expect(bridge.connected).toBe(false);
    await bridge.stop();
  });

  it('rejects connection with project root mismatch', async () => {
    const session = createSession('C:/Games/Test');
    const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
    const { port } = await bridge.start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({
      type: 'hello', token: 'a'.repeat(64), protocol: 1,
      addonVersion: '0.1.0', godotVersion: '4.7.2.stable.official',
      projectRoot: 'C:/Other/Project',
      capabilities: { editor: true, runtime: false, debugger: false, viewport2d: true, viewport3d: true, undoRedo: true }
    }));
    const closeEvent = await new Promise<{ code: number; reason: string }>(resolve => {
      ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    expect(closeEvent.code).toBe(1008);
    expect(closeEvent.reason).toContain('Project mismatch');
    expect(bridge.connected).toBe(false);
    await bridge.stop();
  });

  it('rejects a second concurrent editor connection', async () => {
    const session = createSession('C:/Games/Test');
    const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
    const ws1 = await connect(bridge);
    await bridge.waitUntilConnected(1000);
    expect(bridge.connected).toBe(true);

    const { port } = await bridge.start();
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws2.once('open', resolve);
      ws2.once('error', reject);
    });
    const closeEvent = await new Promise<{ code: number; reason: string }>(resolve => {
      ws2.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
      ws2.send(JSON.stringify({type:'hello',token:'a'.repeat(64),protocol:1,addonVersion:'0.1.0',godotVersion:'4.6.3',projectRoot:session.projectRoot,capabilities:{editor:true,runtime:false,debugger:false,viewport2d:true,viewport3d:true,undoRedo:true}}));
    });
    expect(closeEvent.code).toBe(1008);
    expect(closeEvent.reason).toContain('Only one Godot addon connection is allowed');

    ws1.close();
    await bridge.stop();
  });
});
