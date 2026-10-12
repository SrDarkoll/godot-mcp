import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { SERVER_VERSION } from '@godot-mcp/protocol';
import { afterEach, expect, it } from 'vitest';

const execute = promisify(execFile);
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.unlink(path.join(root, 'checkout')).catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-linked-entry-ñ espacio-'));
  roots.push(root);
  await fs.symlink(repo, path.join(root, 'checkout'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.mkdir(path.join(root, 'game'));
  await fs.writeFile(path.join(root, 'game/project.godot'), '[application]\nconfig/name="Linked entry test"\n');
  return { root, project: path.join(root, 'game'), linked: path.join(root, 'checkout') };
}

it('runs the CLI through a directory link, including paths with spaces and Unicode', async () => {
  const { linked } = await fixture();
  const result = await execute(process.execPath, [path.join(linked, 'packages/cli/dist/index.js'), '--version'], {
    env: { ...process.env, GODOT_MCP_UPDATE_CHECK: '0' }, timeout: 8000
  });
  expect(result.stdout.trim()).toBe(SERVER_VERSION);
});

it.each(['cli', 'server'])('starts real MCP stdio through a linked %s entry', async packageName => {
  const { project, linked } = await fixture();
  const entry = path.join(linked, `packages/${packageName}/dist/index.js`);
  const args = packageName === 'cli' ? [entry, 'start', project, '--bridge-port', '0'] : [entry, '--project', project, '--bridge-port', '0'];
  const transport = new StdioClientTransport({ command: process.execPath, args,
    env: { ...process.env, GODOT_MCP_UPDATE_CHECK: '0' } as Record<string, string>, stderr: 'pipe' });
  const client = new Client({ name: 'linked-entry-regression', version: '1.0.0' });
  try {
    await client.connect(transport);
    const status = await client.callTool({ name: 'session.status', arguments: {} });
    expect(status.structuredContent).toMatchObject({ editorConnected: false });
    expect(status.isError).not.toBe(true);
  } finally { await client.close(); }
});
