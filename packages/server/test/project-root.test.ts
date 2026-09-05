import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertProjectPath, resolveProjectRoot } from '../src/project/project-root.js';

describe('project root', () => {
  it('walks upward to project.godot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'godot-mcp-'));
    await writeFile(path.join(root, 'project.godot'), '[application]\nconfig/name="Fixture"\n');
    const nested = path.join(root, 'scenes', 'levels');
    await import('node:fs/promises').then(fs => fs.mkdir(nested, { recursive: true }));
    expect(await resolveProjectRoot(nested)).toBe(await import('node:fs/promises').then(fs => fs.realpath(root)));
  });

  it('rejects a path that escapes project scope', () => {
    expect(() => assertProjectPath('C:\\Games\\Test', 'C:\\Windows\\System32')).toThrow(/outside project/i);
  });
});
