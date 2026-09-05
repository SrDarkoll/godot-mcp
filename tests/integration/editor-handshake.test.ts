import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
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
const tempRoots: string[] = [];

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return predicate();
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

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Godot editor handshake', () => {
  test('connects the installed addon and serves project and scene reads', async () => {
    const godotBin = process.env.GODOT_BIN;
    if (!godotBin) throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'godot-mcp-integration-'));
    tempRoots.push(tempRoot);
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
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      expect(await waitFor(() => bridge.connected, 10_000)).toBe(true);
      expect(await getProjectInfo(bridge.rpc)).toMatchObject({ name: 'Godot MCP Fixture' });
      expect(await getSceneTree(bridge.rpc)).toMatchObject({
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
  }, 20_000);
});
