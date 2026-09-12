import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';
import { BridgeDescriptorStore } from '../src/session/bridge-descriptor.js';

describe('session store', () => {
  it('does not remove a descriptor written by a newer server session',async()=>{
    const root=await mkdtemp(path.join(tmpdir(),'godot-mcp-owner-'));const first=new BridgeDescriptorStore(root);const second=new BridgeDescriptorStore(root);
    await first.write({port:1234,token:'a'.repeat(64),sessionId:'old'});await second.write({port:2345,token:'b'.repeat(64),sessionId:'new'});
    await first.remove();expect(JSON.parse(await readFile(second.descriptorPath,'utf8')).sessionId).toBe('new');await second.remove();
  });
  it('serializes updates, preserves existing sessions and finishes idempotently', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'godot-mcp-manifest-'));
    const session = createSession(root);
    const store = new SessionStore(root);
    await store.create(session);
    await Promise.all([
      store.update(session.id, m => ({...m,godotVersion:'4.6.3'})),
      store.update(session.id, m => ({...m,errors:[...m.errors,{timestamp:session.startedAt,tool:'visual.capture_viewport_2d',code:'CAPTURE_TIMEOUT',message:'Render deadline exceeded'}]}))
    ]);
    await store.create(session);
    const end = new Date().toISOString();
    await store.finish(session.id,end);
    await store.finish(session.id,'2027-01-01T00:00:00Z');
    expect(await store.read(session.id)).toMatchObject({godotVersion:'4.6.3',endedAt:end,errors:[{code:'CAPTURE_TIMEOUT'}]});
  });

  it('keeps the previous manifest on failed publication and recovers the queue', async () => {
    const root = await mkdtemp(path.join(tmpdir(),'godot-mcp-manifest-'));
    const session = createSession(root);
    const store = new SessionStore(root);
    await store.create(session);
    const rename = vi.spyOn(fs,'rename').mockRejectedValueOnce(new Error('disk failure'));
    try { await expect(store.update(session.id,m => ({...m,godotVersion:'bad'}))).rejects.toMatchObject({code:'MANIFEST_WRITE_FAILED'}); }
    finally { rename.mockRestore(); }
    expect((await store.read(session.id)).godotVersion).toBeNull();
    await store.update(session.id,m => ({...m,godotVersion:'4.6.3'}));
    expect((await store.read(session.id)).godotVersion).toBe('4.6.3');
    expect(() => store.sessionDir('../../escape')).toThrow();
  });

  it('refuses a manifest hard link before reading or replacing an external file', async () => {
    const root=await mkdtemp(path.join(tmpdir(),'godot-mcp-manifest-link-'));
    const outside=path.join(root,'outside.json');await fs.writeFile(outside,'{"private":true}');
    const session=createSession(root);const store=new SessionStore(root);await store.create(session);
    const manifest=path.join(store.sessionDir(session.id),'manifest.json');await fs.unlink(manifest);await fs.link(outside,manifest);
    await expect(store.read(session.id)).rejects.toThrow();
    await expect(store.update(session.id,m=>m)).rejects.toMatchObject({code:'MANIFEST_WRITE_FAILED'});
    expect(await readFile(outside,'utf8')).toBe('{"private":true}');
  });

  it('rejects a sessions junction that points outside the project', async () => {
    const root = await mkdtemp(path.join(tmpdir(),'godot-mcp-junction-'));
    const outside = await mkdtemp(path.join(tmpdir(),'godot-mcp-outside-'));
    await fs.mkdir(path.join(root,'.godot-mcp'));
    await fs.symlink(outside,path.join(root,'.godot-mcp','sessions'),'junction');
    await expect(new SessionStore(root).create(createSession(root))).rejects.toThrow();
    expect(await fs.readdir(outside)).toEqual([]);
  });
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
