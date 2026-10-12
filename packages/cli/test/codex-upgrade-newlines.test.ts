import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { parse } from 'smol-toml';
import { prepareCodexUpgrade } from '../src/setup/codex-upgrade.js';
import { makeClientLaunchEntry } from '../src/setup/client-config.js';
import { BEGIN, END } from '../src/setup/codex-config.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });

it.each([
  { eol: '\r\n', multiline: false, managed: false },
  { eol: '\r\n', multiline: true, managed: false },
  { eol: '\r\n', multiline: false, managed: true },
  { eol: '\r\n', multiline: true, managed: true },
  { eol: '\n', multiline: true, managed: true }
])('migrates $eol arrays (multiline=$multiline managed=$managed) without losing disabled aliases', async ({ eol, multiline, managed }) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-newlines-'));
  roots.push(root); await fs.mkdir(path.join(root, '.codex'));
  const args = ['--yes', '@srdarkx/godot-mcp@0.6.1', 'start', root, '--tool-profile', 'full'];
  const value = multiline ? '[' + eol + args.map(arg => `  ${JSON.stringify(arg)},`).join(eol) + eol + ']' : JSON.stringify(args);
  const text = `model = "keep"${eol}${managed ? BEGIN + eol : ''}[mcp_servers.godot-mcp]${eol}command = "npx"${eol}args = ${value}${eol}enabled = true${eol}startup_timeout_sec = 45.0${eol}${managed ? END + eol : ''}${eol}[mcp_servers.godot-secondary]${eol}enabled = false${eol}`;
  const file = path.join(root, '.codex/config.toml'); await fs.writeFile(file, text);
  const plan = await prepareCodexUpgrade(file, makeClientLaunchEntry(root, 'full'));
  const before = parse(text); const after = parse(plan.after);
  expect(after.model).toBe(before.model);
  expect((after.mcp_servers as any)['godot-secondary']).toEqual({ enabled: false });
  expect((after.mcp_servers as any)['godot-mcp']).toMatchObject({ enabled: true, startup_timeout_sec: 45 });
  if (eol === '\r\n') expect(plan.after).not.toMatch(/(?<!\r)\n/);
  expect(await fs.readFile(file, 'utf8')).toBe(text);
});
