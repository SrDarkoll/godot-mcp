import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it,vi} from 'vitest';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {createSession} from '../src/session/session.js';
import {SessionStore} from '../src/session/session-store.js';
import {VisualTools} from '../src/tools/visual-tools.js';
import {createMcpServer} from '../src/mcp/create-server.js';
import type {BridgeServer} from '../src/bridge/bridge-server.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const payload = {png_base64:png,width:1,height:1,scene:null,captured_at:'2026-09-05T00:00:00Z',viewport_index:null};
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-tools-'));
  const session = createSession(root); const sessions = new SessionStore(root);
  await sessions.create(session);
  const bridge = {connected:true,capabilities:{editor:true,runtime:false,debugger:false,viewport2d:true,viewport3d:true,undoRedo:true},
    rpc:{call:vi.fn(async (method:string,params:Record<string,unknown>) => ({...payload,viewport_index:method.endsWith('3d') ? params.viewport_index : null}))}};
  return {session,sessions,bridge,visual:new VisualTools(session,sessions,bridge)};
}
it('returns the exact persisted image through MCP and reads manifest without editor',async () => {
  const {session,sessions,bridge} = await setup();
  const server = createMcpServer({session,sessions,bridge:bridge as unknown as BridgeServer});
  const [a,b] = InMemoryTransport.createLinkedPair(); const client = new Client({name:'visual-test',version:'1'});
  await server.connect(b); await client.connect(a);
  try {
    const names = (await client.listTools()).tools.map(t=>t.name);
    expect(names).toEqual(expect.arrayContaining(['visual.capture_viewport_2d','visual.capture_viewport_3d','session.manifest']));
    const response = await client.callTool({name:'visual.capture_viewport_2d',arguments:{label:'initial',checkpoint:true}});
    expect(response.isError).not.toBe(true);
    expect(response.content).toContainEqual({type:'image',mimeType:'image/png',data:png});
    const manifest = await sessions.read(session.id);
    expect(manifest.screenshots).toHaveLength(1);
    expect(await fs.readFile(path.join(sessions.sessionDir(session.id),manifest.screenshots[0]!.path))).toEqual(Buffer.from(png,'base64'));
    bridge.connected = false;
    const read = await client.callTool({name:'session.manifest',arguments:{}});
    expect(read.structuredContent).toMatchObject({manifest:{checkpoints:[{kind:'visual'}]}});
    const invalid = await client.callTool({name:'visual.capture_viewport_2d',arguments:{path:'../x'}});
    expect(invalid.isError).toBe(true);
  } finally {await client.close();await server.close();}
});
it('enforces capabilities and does not save rejected responses',async () => {
  const {session,sessions,bridge,visual} = await setup();
  bridge.connected = false;
  await expect(visual.capture('editor_2d',{})).rejects.toMatchObject({code:'EDITOR_NOT_CONNECTED'});
  bridge.connected = true; bridge.capabilities.viewport2d = false;
  await expect(visual.capture('editor_2d',{})).rejects.toMatchObject({code:'CAPTURE_UNSUPPORTED'});
  bridge.capabilities.viewport2d = true;
  bridge.rpc.call.mockResolvedValueOnce({...payload,width:0});
  await expect(visual.capture('editor_2d',{})).rejects.toMatchObject({code:'INVALID_CAPTURE_PAYLOAD'});
  expect((await sessions.read(session.id)).screenshots).toEqual([]);
  const result = await visual.capture('editor_3d',{viewport_index:2,label:'three'});
  expect(result.result.screenshot.viewportIndex).toBe(2);
  expect(bridge.rpc.call).toHaveBeenLastCalledWith('visual.capture_viewport_3d',{viewport_index:2});
  await visual.close();
  await expect(visual.capture('editor_2d',{})).rejects.toMatchObject({code:'SESSION_CLOSED'});
});
