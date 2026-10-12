import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { SERVER_VERSION } from '@godot-mcp/protocol';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli-runner.js';

const available = { currentVersion: SERVER_VERSION, latestVersion: '99.0.0' };
const run = promisify(execFile);
const cli = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })));
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-cli-update-'));
  roots.push(root);
  await fs.writeFile(path.join(root, 'project.godot'), '[application]\nconfig/name="Update checker test"\n');
  const cacheRoot = path.join(root, 'cache');
  await fs.mkdir(path.join(cacheRoot, 'godot-mcp'), { recursive: true });
  await fs.writeFile(path.join(cacheRoot, 'godot-mcp/update-check.json'), JSON.stringify({
    schema: 1, packageName: '@srdarkx/godot-mcp', checkedAt: Date.now(), latest: available.latestVersion, failed: false
  }));
  const env = { ...process.env, LOCALAPPDATA: cacheRoot, XDG_CACHE_HOME: cacheRoot, CI: '', VITEST: '',
    GODOT_MCP_UPDATE_CHECK: '', NO_UPDATE_NOTIFIER: '', npm_config_offline: 'false' };
  return { root, env };
}

it('prints a notice on stderr while preserving version JSON and exit code', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const check = vi.fn().mockResolvedValue(available);
  expect(await runCli(['--version', '--json'], { updateChecker: { check } })).toBe(0);
  expect(output).toHaveBeenCalledTimes(1);
  expect(JSON.parse(output.mock.calls[0]![0])).toEqual({ version: SERVER_VERSION });
  expect(errors.mock.calls.flat().join('\n')).toContain('update available');
  expect(check).toHaveBeenCalledTimes(1);
});

it('contains checker errors and does not check invalid arguments', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const check = vi.fn().mockRejectedValue(new Error('registry offline'));
  expect(await runCli(['--version', '--json'], { updateChecker: { check } })).toBe(0);
  expect(JSON.parse(output.mock.calls[0]![0])).toEqual({ version: SERVER_VERSION });
  check.mockClear();
  expect(await runCli(['unknown-command', '--json'], { updateChecker: { check } })).toBe(2);
  expect(check).not.toHaveBeenCalled();
});

it('executes a command before waiting for its background check', async () => {
  const { root } = await fixture();
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  let resolve!: (value: null) => void;
  const pending = new Promise<null>(done => { resolve = done; });
  const operation = runCli(['status', root, '--json'], { updateChecker: { check: () => pending } });
  try {
    await vi.waitFor(() => expect(output).toHaveBeenCalledTimes(1));
    expect(JSON.parse(output.mock.calls[0]![0])).toMatchObject({ state: 'offline' });
  } finally { resolve(null); }
  expect(await operation).toBe(0);
});

it('uses the real installed CLI without corrupting JSON, and respects opt-out', async () => {
  const { root, env } = await fixture();
  const first = await run(process.execPath, [cli, 'status', root, '--json'], { env, timeout: 8000 });
  expect(JSON.parse(first.stdout)).toMatchObject({ state: 'offline' });
  expect(first.stderr).toContain(`Godot MCP update available: ${SERVER_VERSION} -> 99.0.0`);
  expect(first.stderr).toContain('npx --yes @srdarkx/godot-mcp@latest upgrade .');
  const repeat = await run(process.execPath, [cli, 'status', root, '--json'], { env, timeout: 8000 });
  expect(JSON.parse(repeat.stdout)).toEqual(JSON.parse(first.stdout));
  expect(repeat.stderr).toBe('');
  const disabled = await run(process.execPath, [cli, 'status', root, '--json'], {
    env: { ...env, GODOT_MCP_UPDATE_CHECK: '0' }, timeout: 8000
  });
  expect(JSON.parse(disabled.stdout)).toEqual(JSON.parse(first.stdout));
  expect(disabled.stderr).toBe('');
});

it('delivers the notice through real MCP stdio without CLI output or repeated notices', async () => {
  const { root, env } = await fixture();
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [cli, 'start', root, '--bridge-port', '0'], env: env as Record<string, string>, stderr: 'pipe' });
  const client = new Client({ name: 'cli-update-stdio-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    let notice;
    await vi.waitFor(async () => {
      notice = await client.callTool({ name: 'session.status', arguments: {} });
      expect(notice._meta?.['godot-mcp/update']).toMatchObject(available);
    });
    expect(notice!.structuredContent).toMatchObject({ editorConnected: false });
    const next = await client.callTool({ name: 'session.status', arguments: {} });
    expect(next.structuredContent).toEqual(notice!.structuredContent);
    expect(JSON.stringify(next)).not.toContain('update available');
  } finally { await client.close(); }
}, 10000);
