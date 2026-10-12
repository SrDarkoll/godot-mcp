import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { inspectEffectiveCodex } from '../src/doctor/codex-effective.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-effective-'));
  roots.push(root); await fs.mkdir(path.join(root, '.codex')); await fs.mkdir(path.join(root, 'other'));
  const script = path.join(root, 'fake-codex.mjs');
  const command = { executable: process.execPath, prefix: [script] };
  const entry = (name = 'godot-mcp', project = root, enabled = true, profile = 'full') => ({
    name, enabled, transport: { type: 'stdio', command: 'npx', args: ['--yes', '@srdarkx/godot-mcp@0.6.2', 'start', project, '--tool-profile', profile], env: { SECRET: 'DO_NOT_LEAK' } }
  });
  const respond = (servers: unknown) => fs.writeFile(script, `console.log(${JSON.stringify(JSON.stringify(servers))});`);
  return { root, script, command, entry, respond };
}

it('checks the actual requested working directory and reports global project shadowing', async () => {
  const f = await fixture();
  await fs.writeFile(f.script, `console.log(JSON.stringify([${JSON.stringify(f.entry())}].map(entry=>({...entry,transport:{...entry.transport,args:entry.transport.args.map(arg=>arg===${JSON.stringify(f.root)}&&process.cwd().endsWith('.codex')?${JSON.stringify(path.join(f.root, 'other'))}:arg)}}))));`);
  expect((await inspectEffectiveCodex({ projectRoot: f.root, cwd: f.root, command: f.command })).matches).toBe(true);
  const nested = await inspectEffectiveCodex({ projectRoot: f.root, cwd: path.join(f.root, '.codex'), command: f.command });
  expect(nested).toMatchObject({ available: true, matches: false });
  expect(nested.detail).toContain('register-project-root');
  expect(JSON.stringify(nested)).not.toContain('DO_NOT_LEAK');
});

it('detects duplicate enabled aliases and respects disabled overlays and tool profiles', async () => {
  const f = await fixture();
  await f.respond([f.entry(), f.entry('godot-duplicate')]);
  expect(await inspectEffectiveCodex({ projectRoot: f.root, cwd: f.root, command: f.command }))
    .toMatchObject({ matches: false, duplicateServers: ['godot-mcp', 'godot-duplicate'] });
  await f.respond([f.entry(), f.entry('godot-duplicate', f.root, false)]);
  expect((await inspectEffectiveCodex({ projectRoot: f.root, cwd: f.root, command: f.command })).matches).toBe(true);
  expect((await inspectEffectiveCodex({ projectRoot: f.root, cwd: f.root, toolProfile: '2d', command: f.command })).matches).toBe(false);
  await f.respond([f.entry('godot-mcp', f.root, false)]);
  expect((await inspectEffectiveCodex({ projectRoot: f.root, cwd: f.root, command: f.command })).matches).toBe(false);
});

it.each(['bad-json', 'error', 'unrelated'])('contains %s client configuration failures without exposing raw output', async kind => {
  const f = await fixture();
  if (kind === 'unrelated') await f.respond([{ name: 'godot-mcp', enabled: true, transport: { type: 'stdio', command: 'unrelated', args: ['--project', f.root] } }]);
  else await fs.writeFile(f.script, `console.error('SECRET_VALUE');${kind === 'error' ? 'process.exit(1);' : "console.log('not-json SECRET_VALUE');"}`);
  const result = await inspectEffectiveCodex({ projectRoot: f.root, cwd: f.root, command: f.command });
  expect(result).toMatchObject({ available: true, matches: false });
  expect(JSON.stringify(result)).not.toContain('SECRET_VALUE');
});

it('reports missing Codex as unverified instead of confirmed readiness', async () => {
  const f = await fixture();
  expect(await inspectEffectiveCodex({ projectRoot: f.root, cwd: f.root, env: { PATH: '' } }))
    .toMatchObject({ available: false, matches: false });
});
