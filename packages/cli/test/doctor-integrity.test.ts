import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { doctor } from '../src/doctor/doctor.js';

const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'doctor-integrity-'));
  roots.push(root);
  const template = fileURLToPath(new URL('../../godot-addon/addons/godot_mcp/', import.meta.url));
  await fs.cp(template, path.join(root, 'addons/godot_mcp'), { recursive: true });
  await fs.mkdir(path.join(root, '.godot-mcp'));
  await fs.writeFile(path.join(root, '.godot-mcp/config.json'), JSON.stringify({ protocol: 1 }));
  await fs.writeFile(path.join(root, 'project.godot'), '[autoload]\nGodotMcpRuntime="*res://addons/godot_mcp/runtime/runtime_agent.gd"\n');
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });

it.each(['missing', 'modified'])('detects a %s internal addon file instead of only checking plugin entry files', async kind => {
  const root = await fixture();
  expect((await doctor({ projectRoot: root })).checks.find(check => check.id === 'addon')?.ok).toBe(true);
  const file = path.join(root, 'addons/godot_mcp/bridge/bridge_client.gd');
  if (kind === 'missing') await fs.unlink(file); else await fs.appendFile(file, '\n# unexpected modification\n');
  const report = await doctor({ projectRoot: root });
  expect(report.checks.find(check => check.id === 'addon')).toMatchObject({ ok: false, detail: expect.stringContaining('bridge_client.gd') });
});

it.each([{ protocol: 1, toolProfile: 'invalid' }, { protocol: 1, bridgePort: -1 },
  { protocol: 1, bridgePort: 65536 }, { protocol: 1, godotBin: 42 }, { protocol: 2 }])('checks every project config field with the server schema', async config => {
  const root = await fixture();
  const file = path.join(root, '.godot-mcp/config.json');
  const before = JSON.stringify(config); await fs.writeFile(file, before);
  const report = await doctor({ projectRoot: root });
  expect(report.checks.find(check => check.id === 'protocol')?.ok).toBe(false);
  expect(await fs.readFile(file, 'utf8')).toBe(before);
});
