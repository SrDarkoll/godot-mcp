import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {afterEach,expect,it,vi} from 'vitest';
import {runCli} from '../src/cli-runner.js';

afterEach(()=>vi.restoreAllMocks());
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'cli-upgrade-'));await writeFile(path.join(root,'project.godot'),'config_version=5\n[application]\nconfig/name="Upgrade UX fixture"\n');return root;}

it('offers the safe upgrade flow in noninteractive init without editing an existing installation',async()=>{
 const root=await fixture();await mkdir(path.join(root,'addons/godot_mcp'),{recursive:true});
 const file=path.join(root,'addons/godot_mcp/plugin.cfg');await writeFile(file,'version="0.5.3"\n');
 const messages:string[]=[];vi.spyOn(console,'log').mockImplementation(v=>messages.push(String(v)));
 expect(await runCli(['init',root,'--json'])).toBe(1);
 expect(JSON.parse(messages.at(-1)!)).toMatchObject({ok:false,error:{code:'UPGRADE_AVAILABLE',details:{command:expect.stringContaining(' upgrade ')}}});
 expect(await readFile(file,'utf8')).toBe('version="0.5.3"\n');
});

it('rejects an unrelated Codex launch before installing addon files',async()=>{
 const root=await fixture();await mkdir(path.join(root,'.codex'));
 const file=path.join(root,'.codex/config.toml'),before='[mcp_servers.godot-mcp]\ncommand = "custom"\nargs = []\n';await writeFile(file,before);
 const messages:string[]=[];vi.spyOn(console,'log').mockImplementation(v=>messages.push(String(v)));
 expect(await runCli(['init',root,'--client','codex','--json'])).toBe(1);
 expect(JSON.parse(messages.at(-1)!)).toMatchObject({error:{code:'UPGRADE_CONFIG_UNRECOGNIZED'}});
 expect(await readFile(file,'utf8')).toBe(before);
 await expect(readFile(path.join(root,'addons/godot_mcp/plugin.cfg'))).rejects.toMatchObject({code:'ENOENT'});
});
