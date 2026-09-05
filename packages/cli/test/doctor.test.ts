import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { doctor } from '../src/doctor/doctor.js';

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
