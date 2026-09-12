import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, test } from 'vitest';
import { initProject } from '../../packages/cli/src/init/init-project.js';
import { BridgeServer } from '../../packages/server/src/bridge/bridge-server.js';
import {
  BridgeDescriptorStore,
  createBridgeToken
} from '../../packages/server/src/session/bridge-descriptor.js';
import { SessionStore } from '../../packages/server/src/session/session-store.js';
import { createSession } from '../../packages/server/src/session/session.js';
import { getProjectInfo } from '../../packages/server/src/tools/project-info.js';
import { getSceneTree } from '../../packages/server/src/tools/scene-tree.js';

const fixtureRoot = path.resolve('fixtures/empty-project');
async function retainedRoot(prefix:string){const parent=path.resolve('.godot-mcp/editor-test-runs');await mkdir(parent,{recursive:true});return mkdtemp(path.join(parent,prefix));}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return await predicate();
}

async function stopProcess(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    new Promise<void>(resolve => setTimeout(resolve, 2_000))
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

describe('Godot editor handshake', () => {
  test('connects the installed addon and serves project and scene reads', async () => {
    const godotBin = process.env.GODOT_BIN;
    if (!godotBin) throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');

    const tempRoot = await retainedRoot('handshake-');
    await cp(fixtureRoot, tempRoot, { recursive: true });
    await initProject({ projectRoot: tempRoot, godotBin, enable: true });

    const session = createSession(tempRoot);
    const sessionStore = new SessionStore(tempRoot);
    await sessionStore.create(session);
    const token = createBridgeToken();
    const bridge = new BridgeServer({ session, token, port: 0 });
    const descriptor = new BridgeDescriptorStore(tempRoot);
    let godot: ChildProcess | null = null;

    try {
      const { port } = await bridge.start();
      await descriptor.write({ port, token, sessionId: session.id });
      godot = spawn(godotBin, ['--headless', '--path', tempRoot, '--editor', 'res://main.tscn'], {
        stdio: 'inherit',
        windowsHide: true
      });

      expect(await waitFor(() => bridge.connected, 15_000)).toBe(true);
      expect(await getProjectInfo(bridge.rpc)).toMatchObject({ name: 'Godot MCP Fixture' });

      let tree = await getSceneTree(bridge.rpc);
      const deadline = Date.now() + 10_000;
      while (!tree.root && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
        tree = await getSceneTree(bridge.rpc);
      }

      expect(tree).toMatchObject({
        root: {
          name: 'Main',
          type: 'Node2D',
          children: [{
            name: 'Player',
            type: 'CharacterBody2D',
            children: [{ name: 'Camera2D', type: 'Camera2D' }]
          }]
        }
      });
    } finally {
      await stopProcess(godot);
      await descriptor.remove();
      await bridge.stop();
    }

    const manifestPath = path.join(sessionStore.sessionDir(session.id), 'manifest.json');
    await stat(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { sessionId: string };
    expect(manifest.sessionId).toBe(session.id);
  }, 25_000);

  test('serves session.status, project.info, and scene.get_tree over stdio MCP client to live Godot editor and cleans up on EOF', async () => {
    const godotBin = process.env.GODOT_BIN;
    if (!godotBin) throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');

    const tempRoot = await retainedRoot('stdio-');
    await cp(fixtureRoot, tempRoot, { recursive: true });
    await initProject({ projectRoot: tempRoot, godotBin, enable: true });

    const serverEntry = path.resolve('packages/server/dist/index.js');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry, '--project', tempRoot, '--bridge-port', '0']
    });
    const client = new Client({ name: 'integration-test', version: '0.1.0' });
    await client.connect(transport);

    const descriptorPath = path.join(tempRoot, '.godot-mcp', 'runtime', 'bridge.json');
    let godot: ChildProcess | null = null;

    try {
      // 1. session.status works while editor is disconnected
      const initialStatus = await client.callTool({ name: 'session.status', arguments: {} });
      const initialStatusData = initialStatus.structuredContent as Record<string, unknown>;
      expect(initialStatusData['editorConnected']).toBe(false);

      // Verify descriptor exists
      expect(await waitFor(() => stat(descriptorPath).then(() => true, () => false), 5_000)).toBe(true);

      // 2. Launch Godot editor headless
      godot = spawn(godotBin, ['--headless', '--path', tempRoot, '--editor', 'res://main.tscn'], {
        stdio: 'inherit',
        windowsHide: true
      });

      // 3. Wait for editor to connect via session.status
      const connected = await waitFor(async () => {
        const res = await client.callTool({ name: 'session.status', arguments: {} });
        return (res.structuredContent as Record<string, unknown>)['editorConnected'] === true;
      }, 15_000);
      expect(connected).toBe(true);

      // 4. project.info returns fixture project info
      const projectInfo = await client.callTool({ name: 'project.info', arguments: {} });
      expect(projectInfo.structuredContent).toMatchObject({ name: 'Godot MCP Fixture' });

      // 5. scene.get_tree returns expected nodes
      let tree = await client.callTool({ name: 'scene.get_tree', arguments: {} });
      const deadline = Date.now() + 10_000;
      while (!(tree.structuredContent as Record<string, unknown>)['root'] && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
        tree = await client.callTool({ name: 'scene.get_tree', arguments: {} });
      }
      expect(tree.structuredContent).toMatchObject({
        root: {
          name: 'Main',
          type: 'Node2D',
          children: [{
            name: 'Player',
            type: 'CharacterBody2D',
            children: [{ name: 'Camera2D', type: 'Camera2D' }]
          }]
        }
      });
    } finally {
      await stopProcess(godot);
      await client.close();
    }

    // 6. Verify bridge descriptor is cleaned up and not left behind
    const descriptorCleaned = await waitFor(async () => {
      try {
        await stat(descriptorPath);
        return false;
      } catch {
        return true;
      }
    }, 5_000);
    expect(descriptorCleaned).toBe(true);
  }, 35_000);
});
