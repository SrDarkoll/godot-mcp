import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initProject } from '../src/init/init-project.js';
import {mkdir} from 'node:fs/promises';

async function createTempGodotProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'godot-mcp-cli-'));
  await writeFile(path.join(root, 'project.godot'), '[application]\nconfig/name="Fixture"\n');
  return root;
}
it('does not install over a pending project recovery journal',async()=>{
 const root=await createTempGodotProject();
 await mkdir(path.join(root,'.godot-mcp/runtime'),{recursive:true});
 await writeFile(path.join(root,'.godot-mcp/runtime/recovery.json'),'pending recovery');
 await expect(initProject({projectRoot:root,enable:false})).rejects.toMatchObject({code:'RECOVERY_REQUIRED'});
 await expect(stat(path.join(root,'addons'))).rejects.toMatchObject({code:'ENOENT'});
});
it('can maintain a project after acquiring exclusion despite an unreadable stale descriptor',async()=>{
 const root=await createTempGodotProject();
 await mkdir(path.join(root,'.godot-mcp/runtime'),{recursive:true});
 await writeFile(path.join(root,'.godot-mcp/runtime/bridge.json'),'stale malformed descriptor');
 const result=await initProject({projectRoot:root,enable:false});
 expect(result.addonPath).toBe(path.join(root,'addons/godot_mcp'));
 expect(result.warnings).toContain('Previous bridge descriptor could not be contacted; exclusive project maintenance acquired.');
});

it('installs addon and local config without deleting existing project files', async () => {
  const root = await createTempGodotProject();
  await initProject({ projectRoot: root, enable: false });
  await expect(stat(path.join(root, 'addons', 'godot_mcp', 'plugin.cfg'))).resolves.toBeDefined();
  const config = JSON.parse(await readFile(path.join(root, '.godot-mcp', 'config.json'), 'utf8'));
  expect(config).toEqual({ protocol: 1, bridgePort: 61337, godotBin:null });
  expect(await readFile(path.join(root, 'project.godot'), 'utf8')).toContain('config/name');
});

it('preserves unrelated config keys and existing addon files', async () => {
  const root = await createTempGodotProject();
  await import('node:fs/promises').then(fs => fs.mkdir(path.join(root, '.godot-mcp'), { recursive: true }));
  await writeFile(path.join(root, '.godot-mcp', 'config.json'), JSON.stringify({ custom: true, bridgePort: 9999 }));
  await import('node:fs/promises').then(fs => fs.mkdir(path.join(root, 'addons', 'godot_mcp'), { recursive: true }));
  await writeFile(path.join(root, 'addons', 'godot_mcp', 'user-note.txt'), 'keep');
  await initProject({ projectRoot: root, enable: false });
  const config = JSON.parse(await readFile(path.join(root, '.godot-mcp', 'config.json'), 'utf8'));
  expect(config.custom).toBe(true);
  expect(config.bridgePort).toBe(9999);
  expect(await readFile(path.join(root, 'addons', 'godot_mcp', 'user-note.txt'), 'utf8')).toBe('keep');
});
it('backs up changed managed addon files before updating them',async()=>{
 const root=await createTempGodotProject();await initProject({projectRoot:root,enable:false});
 await writeFile(path.join(root,'addons/godot_mcp/plugin.gd'),'custom addon code');
 const updated=await initProject({projectRoot:root,enable:false});
 expect(updated.backupPath).toEqual(expect.any(String));
 expect(await readFile(path.join(updated.backupPath!,'files/plugin.gd'),'utf8')).toBe('custom addon code');
 expect(await readFile(path.join(root,'addons/godot_mcp/plugin.gd'),'utf8')).toContain('extends EditorPlugin');
});
