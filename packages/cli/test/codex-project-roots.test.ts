import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';
import { afterEach, expect, it } from 'vitest';
import { addGodotRootMarker, registerCodexProjectRoot } from '../src/setup/codex-project-roots.js';

const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-project-roots-'));
  roots.push(root); await fs.mkdir(path.join(root, '.codex'));
  return { root, file: path.join(root, '.codex/config.toml'), options: { homeDir: root, env: {} } };
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });

it.each([
  '', '# retain comments\nmodel = "keep"\n[projects."C:/Game"]\ntrust_level = "untrusted"\n',
  'project_root_markers = [".hg", ".sl"] # keep marker notes\nmodel = "keep"\n',
  '"project_root_markers" = [\n ".git", # keep this\n]\nmodel = "keep"\n',
  "'project_root_markers' = []\nmodel = 'keep'\n",
  'note = """\n[pretend.table]\nproject_root_markers = ["fake"]\n"""\nproject_root_markers = [".git"]\n',
  'note = \'\'\'\nproject_root_markers = ["fake"]\n\'\'\'\nproject_root_markers = [".git"]\n',
  'project_root_markers = [".git" # no trailing comma\n]\n',
  'model = "keep"\r\n[mcp_servers.other]\r\ncommand = "custom"\r\n'
])('adds only the Godot marker to a valid TOML form', text => {
  const result = addGodotRootMarker(text);
  const before = parse(text); const after = parse(result.text);
  expect(after.project_root_markers).toEqual([...(before.project_root_markers as string[] ?? ['.git']), 'project.godot']);
  delete before.project_root_markers; delete after.project_root_markers;
  expect(after).toEqual(before);
  if (text.includes('# keep')) expect(result.text).toContain('# keep');
  if (text.includes('\r\n')) expect(result.text).not.toMatch(/(?<!\r)\n/);
});

it('is idempotent and preserves exact configuration and backup bytes', async () => {
  const { file, options } = await fixture();
  const bytes = Buffer.from('\ufeffmodel = "personal"\r\n[mcp_servers.other]\r\ncommand = "custom"\r\n');
  await fs.writeFile(file, bytes);
  const first = await registerCodexProjectRoot(options);
  expect(first.changed).toBe(true);
  expect(await fs.readFile(first.backupPath!)).toEqual(bytes);
  const updated = await fs.readFile(file);
  expect(updated.subarray(0, 3)).toEqual(bytes.subarray(0, 3));
  expect((await registerCodexProjectRoot(options)).changed).toBe(false);
  expect(await fs.readFile(file)).toEqual(updated);
  expect((await fs.readdir(path.dirname(file))).filter(name => name.endsWith('.bak'))).toHaveLength(1);
});

it.each(['{broken', 'project_root_markers = 1\n', 'project_root_markers = [".git", 1]\n'])('refuses invalid settings before any backup or write', async text => {
  const { file, options } = await fixture(); await fs.writeFile(file, text);
  await expect(registerCodexProjectRoot(options)).rejects.toMatchObject({ code: 'CODEX_ROOT_CONFIG_INVALID' });
  expect(await fs.readFile(file, 'utf8')).toBe(text);
  expect(await fs.readdir(path.dirname(file))).toEqual(['config.toml']);
});

it('preserves a concurrent edit and respects an isolated CODEX_HOME', async () => {
  const { file, options } = await fixture(); await fs.writeFile(file, 'model = "before"\n');
  await expect(registerCodexProjectRoot({ ...options, beforeWrite: () => fs.writeFile(file, 'model = "human-edit"\n') }))
    .rejects.toMatchObject({ code: 'CODEX_CONFIG_CHANGED' });
  expect(await fs.readFile(file, 'utf8')).toBe('model = "human-edit"\n');
  const isolated = await fixture();
  const result = await registerCodexProjectRoot({ env: { CODEX_HOME: path.dirname(isolated.file) }, homeDir: options.homeDir });
  expect(result.path).toBe(isolated.file);
  expect(await fs.readFile(file, 'utf8')).toBe('model = "human-edit"\n');
});

it('refuses a hard-linked user config and preserves its other name', async () => {
  const { root, file, options } = await fixture(); const original = path.join(root, 'original.toml');
  await fs.writeFile(original, 'model = "keep"\n'); await fs.link(original, file);
  await expect(registerCodexProjectRoot(options)).rejects.toThrow(/single-linked/);
  expect(await fs.readFile(original, 'utf8')).toBe('model = "keep"\n');
});
