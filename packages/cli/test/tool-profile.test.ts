import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { runCli } from '../src/cli-runner.js';

it('persists tool profile through config without changing unrelated project config', async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),'godot-mcp-tool-profile-'));
  await writeFile(path.join(root,'project.godot'),'config_version=5\n[application]\nconfig/name="Profile fixture"\n');
  await mkdir(path.join(root,'.godot-mcp'),{recursive:true});
  await writeFile(path.join(root,'.godot-mcp','config.json'),JSON.stringify({custom:true,bridgePort:9999}));
  const output:string[]=[];
  vi.spyOn(console,'log').mockImplementation(value=>output.push(String(value)));
  expect(await runCli(['config',root,'--tool-profile','navigation','--json'])).toBe(0);
  expect(JSON.parse(output.at(-1)!)).toMatchObject({toolProfile:'navigation',saved:true,restartRequired:true});
  expect(JSON.parse(await readFile(path.join(root,'.godot-mcp','config.json'),'utf8'))).toMatchObject({custom:true,bridgePort:9999,toolProfile:'navigation'});
  vi.restoreAllMocks();
});
