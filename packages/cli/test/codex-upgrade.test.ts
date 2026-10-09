import {mkdtemp,mkdir,readFile,writeFile,link} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it} from 'vitest';
import {parse} from 'smol-toml';
import {SERVER_VERSION} from '@godot-mcp/protocol';
import {prepareCodexUpgrade,applyCodexUpgrade} from '../src/setup/codex-upgrade.js';
import {makeClientLaunchEntry} from '../src/setup/client-config.js';
import {inspectManagedCodexConfig} from '../src/setup/codex-config.js';

async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'codex-upgrade-'));
 const file=path.join(root,'.codex','config.toml');await mkdir(path.dirname(file));
 const entry=makeClientLaunchEntry(root,'2d',`@srdarkx/godot-mcp@${SERVER_VERSION}`);
 return {root,file,entry};
}

it('migrates an old npm pin and preserves other MCPs, options and env tables',async()=>{
 const h=await fixture();const other='[mcp_servers.other]\ncommand = "keep"\nargs = ["one"]\n';
 const before=`model = "keep-model"\n\n[mcp_servers."godot-mcp"]\ncommand = 'npx.cmd'\nargs = [\n '--yes',\n '@srdarkx/godot-mcp@0.5.3', # old pin\n 'start', ${JSON.stringify(h.root)}, '--tool-profile', '2d', '--bridge-port', '0'\n]\nstartup_timeout_sec = 90\nenabled = true\n[mcp_servers."godot-mcp".env]\nMY_OPTION = "preserve"\n\n${other}`;
 await writeFile(h.file,before);
 const plan=await prepareCodexUpgrade(h.file,h.entry);
 expect(plan.kind).toBe('legacy');expect(await readFile(h.file,'utf8')).toBe(before);
 const result=await applyCodexUpgrade(plan);
 const after=await readFile(h.file,'utf8');const parsed=parse(after) as any;
 expect(after).toContain(other);expect(parsed.model).toBe('keep-model');
 expect(parsed.mcp_servers['godot-mcp']).toMatchObject({startup_timeout_sec:90,enabled:true,env:{MY_OPTION:'preserve'}});
 expect(parsed.mcp_servers['godot-mcp'].args).toContain(`@srdarkx/godot-mcp@${SERVER_VERSION}`);
 expect(parsed.mcp_servers['godot-mcp'].args.slice(-2)).toEqual(['--bridge-port','0']);
 expect(await readFile(result.backupPath!,'utf8')).toBe(before);
 expect(await inspectManagedCodexConfig(h.file,h.entry)).toBe(true);
 expect((await prepareCodexUpgrade(h.file,h.entry)).changed).toBe(false);
});

it('recognizes a node recipe only when its server belongs to the public npm bundle',async()=>{
 const h=await fixture();const bundle=path.join(h.root,'node_modules','@srdarkx','godot-mcp');
 const server=path.join(bundle,'node_modules','@godot-mcp','server');await mkdir(path.join(server,'dist'),{recursive:true});
 await writeFile(path.join(bundle,'package.json'),JSON.stringify({name:'@srdarkx/godot-mcp',version:'0.5.1'}));
 await writeFile(path.join(server,'package.json'),JSON.stringify({name:'@godot-mcp/server',version:'0.5.1'}));
 await writeFile(path.join(server,'dist','index.js'),'');
 await writeFile(h.file,`[mcp_servers.godot-mcp]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([path.join(server,'dist','index.js'),'--project',h.root,'--tool-profile','2d'])}\n`);
 const plan=await prepareCodexUpgrade(h.file,h.entry);expect(plan.kind).toBe('legacy');
 await applyCodexUpgrade(plan);
 expect((parse(await readFile(h.file,'utf8')) as any).mcp_servers['godot-mcp'].command).toBe('npx');
});

it('refuses unrelated, invalid and ambiguous configs before touching their bytes',async()=>{
 const h=await fixture();
 for(const text of [
  '[mcp_servers.godot-mcp]\ncommand = "custom"\nargs = []\n',
  '[mcp_servers.godot-mcp]\ncommand = "npx"\nargs = ["unrelated-package"]\n',
  '[mcp_servers.godot-mcp]\ncommand = "npx"\nargs = [',
  '[mcp_servers]\ngodot-mcp = {command="npx",args=["@srdarkx/godot-mcp"]}\n'
 ]){
  await writeFile(h.file,text);await expect(prepareCodexUpgrade(h.file,h.entry)).rejects.toThrow();
  expect(await readFile(h.file,'utf8')).toBe(text);
 }
});

it('rejects a server targeting another project and preserves a concurrent edit',async()=>{
 const h=await fixture();
 await writeFile(h.file,`[mcp_servers.godot-mcp]\ncommand = "npx"\nargs = ${JSON.stringify(['@srdarkx/godot-mcp@0.5.3','start',path.join(h.root,'other')])}\n`);
 await expect(prepareCodexUpgrade(h.file,h.entry)).rejects.toThrow(/project/i);
 await writeFile(h.file,'model = "before"\n');const plan=await prepareCodexUpgrade(h.file,h.entry);
 await writeFile(h.file,'model = "human-edit"\n');await expect(applyCodexUpgrade(plan)).rejects.toThrow(/changed/i);
 expect(await readFile(h.file,'utf8')).toBe('model = "human-edit"\n');
});

it('rejects linked configs and preserves literal fake headers in multiline strings',async()=>{
 const h=await fixture();const original=path.join(h.root,'original.toml');await writeFile(original,'model = "keep"\n');
 await link(original,h.file);await expect(prepareCodexUpgrade(h.file,h.entry)).rejects.toThrow(/single-linked/i);
 const fresh=await fixture();await writeFile(fresh.file,'note = """\n[mcp_servers.godot-mcp]\ncommand = "custom"\n"""\n');
 const plan=await prepareCodexUpgrade(fresh.file,fresh.entry);await applyCodexUpgrade(plan);
 expect((parse(await readFile(fresh.file,'utf8')) as any).note).toContain('command = "custom"');
});
