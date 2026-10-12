import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readDescriptor, serverStatus, stopServer } from '@godot-mcp/server/management';
import { ProjectLease } from '@godot-mcp/server/project-lease';
import { expect, it } from 'vitest';

async function project() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-shared-codex-'));
  await fs.writeFile(path.join(root, 'project.godot'), '[application]\nconfig/name="Shared clients"\n');
  return root;
}
function launch(root: string, profile = 'minimal') {
  const client = new Client({ name: 'codex-shared-regression', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../dist/index.js', import.meta.url)), 'start', root, '--bridge-port', '0', '--tool-profile', profile],
    env: { ...process.env, GODOT_MCP_UPDATE_CHECK: '0' } as Record<string, string>, stderr: 'pipe' });
  return { client, transport, connect: () => client.connect(transport) };
}
async function status(client: Client) {
  const result = await client.callTool({ name: 'session.status', arguments: {} });
  expect(result.isError).not.toBe(true);
  return result.structuredContent as { sessionId: string; projectRoot: string };
}
async function cleanup(root: string, clients: Client[]) {
  await Promise.all(clients.map(client => client.close()));
  const until = Date.now() + 5000;
  while (await readDescriptor(root)) {
    try { await stopServer(root); break; }
    catch (error) { if ((error as { code?: string }).code !== 'SERVER_UNAVAILABLE') throw error; }
    if (Date.now() >= until) throw new Error('The owned test server did not finish shutdown');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  await fs.rm(root, { recursive: true, force: true });
}

it('shares one project session across tool discovery and chats with independent tool profiles', async () => {
  const root = await project();
  const first = launch(root); const second = launch(root, 'full');
  try {
    await first.connect();
    const initial = await status(first.client); const descriptor = await readDescriptor(root);
    await second.connect();
    expect(await status(second.client)).toEqual(initial);
    expect((await readDescriptor(root))?.pid).toBe(descriptor?.pid);
    expect((await first.client.listTools()).tools.length).toBeLessThan((await second.client.listTools()).tools.length);
    await first.client.close();
    expect(await status(second.client)).toEqual(initial);
    expect((await serverStatus(root)).state).toBe('running');
    await second.client.close();
    const until = Date.now() + 5000;
    while (await readDescriptor(root)) {
      if (Date.now() >= until) throw new Error('The last client did not release its project session');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    expect((await serverStatus(root)).state).toBe('offline');
  } finally { await cleanup(root, [first.client, second.client]); }
}, 30000);

it('initializes concurrent first clients on the same project without a lease collision', async () => {
  const root = await project(); const peers = [launch(root), launch(root), launch(root)];
  try {
    await Promise.all(peers.map(peer => peer.connect()));
    const states = await Promise.all(peers.map(peer => status(peer.client)));
    expect(new Set(states.map(state => state.sessionId)).size).toBe(1);
    await peers[0].client.close();
    expect(await status(peers[1].client)).toEqual(states[0]);
  } finally { await cleanup(root, peers.map(peer => peer.client)); }
}, 30000);

it('keeps addon maintenance exclusive instead of taking over its project lease', async () => {
  const root = await project(); const lease = await ProjectLease.acquire(root, { operation: 'addon_update' });
  const peer = launch(root);
  try {
    await expect(peer.connect()).rejects.toThrow();
    expect(await readDescriptor(root)).toBeNull();
    await expect(ProjectLease.acquire(root)).rejects.toMatchObject({ code: 'PROJECT_BUSY' });
  } finally {
    await peer.client.close(); await lease.release(); await fs.rm(root, { recursive: true, force: true });
  }
}, 15000);

it('rejects unauthenticated, mismatched and oversized pipe greetings without disrupting its valid client', async () => {
  const root = await project(); const peer = launch(root);
  try {
    await peer.connect(); const initial = await status(peer.client); const descriptor = (await readDescriptor(root))!;
    const hello = { type: 'mcp_attach', protocol: 1, token: descriptor.token, sessionId: descriptor.sessionId, toolProfile: 'minimal' };
    const inputs = [JSON.stringify({ ...hello, token: '0'.repeat(64) }) + '\n',
      JSON.stringify({ ...hello, sessionId: 'another-session' }) + '\n',
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n', 'x'.repeat(5000)];
    for (const input of inputs) {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = connect(descriptor.mcpPipe!); let text = '';
        const timer = setTimeout(() => { socket.destroy(); reject(new Error('Invalid greeting was not closed')); }, 4000);
        socket.once('connect', () => socket.write(input)); socket.on('data', chunk => { text += chunk.toString(); });
        socket.on('error', () => {});
        socket.once('close', () => { clearTimeout(timer); resolve(text); });
      });
      expect(response).toBe(''); expect(await status(peer.client)).toEqual(initial);
    }
  } finally { await cleanup(root, [peer.client]); }
}, 30000);

it('reports an incompatible active owner instead of replacing or terminating it', async () => {
  const root = await project(); const first = launch(root); const second = launch(root);
  const file = path.join(root, '.godot-mcp/runtime/bridge.json'); let original: Buffer | undefined;
  try {
    await first.connect(); const initial = await status(first.client); original = await fs.readFile(file);
    const descriptor = JSON.parse(original.toString()); descriptor.serverVersion = '0.0.1';
    await fs.writeFile(file, JSON.stringify(descriptor));
    await expect(second.connect()).rejects.toThrow();
    expect(await status(first.client)).toEqual(initial);
    expect((await readDescriptor(root))?.pid).toBe(descriptor.pid);
  } finally {
    if (original) await fs.writeFile(file, original);
    await cleanup(root, [first.client, second.client]);
  }
}, 30000);
