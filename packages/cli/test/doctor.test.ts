import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { doctor } from '../src/doctor/doctor.js';
import { configureClient } from '../src/setup/client-config.js';

it('reports project/addon/node checks independently', async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'godot-mcp-doctor-'));
  await writeFile(path.join(fixtureRoot, 'project.godot'), '[application]\nconfig/name="Fixture"\n');
  const report = await doctor({ projectRoot: fixtureRoot, godotBin: null });
  expect(report.checks.find(c => c.id === 'node')?.ok).toBe(true);
  expect(report.checks.find(c => c.id === 'project')?.ok).toBe(true);
  expect(report.checks.find(c => c.id === 'addon')?.ok).toBe(false);
  expect(report.checks.find(c => c.id === 'godot')?.ok).toBe(false);
  expect(report.checks.find(c => c.id === 'runtime')?.ok).toBe(false);
});

it('checks the managed Codex entry only when that project uses one', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'godot-mcp-doctor-codex-'));
  await writeFile(path.join(root, 'project.godot'), '[application]\nconfig/name="Fixture"\n');
  await mkdir(path.join(root, '.godot-mcp'), { recursive: true });
  await writeFile(path.join(root, '.godot-mcp', 'config.json'), JSON.stringify({ protocol: 1, toolProfile: '2d' }));
  await configureClient({ client: 'codex', projectRoot: root, toolProfile: '2d', env: {}, homeDir: root });
  const configured = await doctor({ projectRoot: root, godotBin: null });
  expect(configured.checks.find(check => check.id === 'codex')).toMatchObject({ ok: true });
  const file = path.join(root, '.codex', 'config.toml');
  await writeFile(file, (await readFile(file, 'utf8')).replace('"--tool-profile","2d"', '"--tool-profile","3d"'));
  const stale = await doctor({ projectRoot: root, godotBin: null });
  expect(stale.checks.find(check => check.id === 'codex')).toMatchObject({ ok: false });
});
