import {mkdir,mkdtemp,realpath,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {runCli} from '../src/cli-runner.js';

afterEach(()=>vi.restoreAllMocks());

async function corruptConfigFixture():Promise<string>{
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'godot-mcp-cli-status-')));
  await writeFile(path.join(root,'project.godot'),'config_version=5\n[application]\nconfig/name="CLI status fixture"\n');
  await mkdir(path.join(root,'.godot-mcp'),{recursive:true});
  await writeFile(path.join(root,'.godot-mcp','config.json'),'{"bridgePort":"invalid"}');
  return root;
}

it('reports offline status even when project config is invalid',async()=>{
  const root=await corruptConfigFixture();
  const output:string[]=[];
  vi.spyOn(console,'log').mockImplementation(value=>output.push(String(value)));

  expect(await runCli(['status',root,'--json'])).toBe(0);
  expect(JSON.parse(output.at(-1)!)).toMatchObject({state:'offline',projectRoot:root,editorConnected:false,runtimeConnected:false});
});

it('doctor reports invalid config instead of failing before diagnostics',async()=>{
  const root=await corruptConfigFixture();
  const output:string[]=[];
  vi.spyOn(console,'log').mockImplementation(value=>output.push(String(value)));

  expect(await runCli(['doctor',root,'--godot',process.execPath,'--json'])).toBe(1);
  const report=JSON.parse(output.at(-1)!);
  expect(report.checks).toContainEqual(expect.objectContaining({id:'protocol',ok:false}));
  expect(report.error).toBeUndefined();
});
