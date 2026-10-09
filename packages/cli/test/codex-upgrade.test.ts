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

async function localLauncher(h:Awaited<ReturnType<typeof fixture>>,wrapper=true){
 const checkout=path.join(h.root,'source-checkout'),server=path.join(checkout,'packages/server');
 await mkdir(path.join(server,'dist'),{recursive:true});await mkdir(path.join(checkout,'packages/cli'),{recursive:true});
 await writeFile(path.join(checkout,'package.json'),JSON.stringify({name:'godot-mcp-monorepo',private:true,workspaces:['packages/*']}));
 await writeFile(path.join(checkout,'packages/cli/package.json'),JSON.stringify({name:'@srdarkx/godot-mcp'}));
 await writeFile(path.join(server,'package.json'),JSON.stringify({name:'@godot-mcp/server',version:'0.6.0'}));
 const serverPath=path.join(server,'dist/index.js');await writeFile(serverPath,'throw new Error("must not execute server");');
 const wrapperPath=path.join(h.root,'retry.mjs'),wrapperBytes='throw new Error("must not execute wrapper");\n';await writeFile(wrapperPath,wrapperBytes);
 const args=[...(wrapper?[wrapperPath]:[]),serverPath,'--project',h.root,'--tool-profile','2d','--bridge-port','0'];
 const before=`[mcp_servers.godot-mcp]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify(args)}\nenabled = true\nrequired = true\nstartup_timeout_sec = 45\n[mcp_servers.godot-mcp.env]\nKEEP = "yes"\n[mcp_servers.other]\ncommand = "keep-other"\n`;
 await writeFile(h.file,before);return {serverPath,wrapperPath,wrapperBytes,before,checkout,args};
}

it('previews a source-checkout launcher and requires explicit replacement consent',async()=>{
 const h=await fixture(),local=await localLauncher(h,false);
 const plan=await prepareCodexUpgrade(h.file,h.entry);
 expect(plan.launcherReplacement).toMatchObject({kind:'source_checkout',serverPath:local.serverPath,previous:{command:process.execPath,args:local.args}});
 expect(plan.entry.args).toContain(`@srdarkx/godot-mcp@${SERVER_VERSION}`);
 await expect(applyCodexUpgrade(plan)).rejects.toMatchObject({code:'LAUNCHER_REPLACEMENT_REQUIRED'});
 expect(await readFile(h.file,'utf8')).toBe(local.before);
 const result=await applyCodexUpgrade(plan,{replaceLauncher:true});expect(await readFile(result.backupPath!,'utf8')).toBe(local.before);
});

it('recognizes a wrapper followed by a verified server without executing it or losing other settings',async()=>{
 const h=await fixture(),local=await localLauncher(h);
 const plan=await prepareCodexUpgrade(h.file,h.entry);
 expect(plan.launcherReplacement).toMatchObject({kind:'wrapper',wrapperPath:local.wrapperPath,serverPath:local.serverPath});
 await expect(applyCodexUpgrade(plan)).rejects.toMatchObject({code:'LAUNCHER_REPLACEMENT_REQUIRED'});
 const result=await applyCodexUpgrade(plan,{replaceLauncher:true});
 const parsed=parse(await readFile(h.file,'utf8')) as any;
 expect(parsed.mcp_servers['godot-mcp']).toMatchObject({command:'npx',enabled:true,required:true,startup_timeout_sec:45,env:{KEEP:'yes'}});
 expect(parsed.mcp_servers.other.command).toBe('keep-other');expect(parsed.mcp_servers['godot-mcp'].args.slice(-2)).toEqual(['--bridge-port','0']);
 expect(await readFile(local.wrapperPath,'utf8')).toBe(local.wrapperBytes);expect(await readFile(result.backupPath!,'utf8')).toBe(local.before);
 expect(await inspectManagedCodexConfig(h.file,h.entry)).toBe(true);
});

it('refuses wrapper adoption for an unrelated server, a different project or unknown forwarding arguments',async()=>{
 const h=await fixture(),local=await localLauncher(h);
 await writeFile(path.join(local.checkout,'packages/cli/package.json'),JSON.stringify({name:'unrelated'}));
 await expect(prepareCodexUpgrade(h.file,h.entry)).rejects.toMatchObject({code:'UPGRADE_CONFIG_UNRECOGNIZED'});
 expect(await readFile(h.file,'utf8')).toBe(local.before);
 await writeFile(path.join(local.checkout,'packages/cli/package.json'),JSON.stringify({name:'@srdarkx/godot-mcp'}));
 for(const args of [[local.wrapperPath,local.serverPath,'--project',path.join(h.root,'other')],[...local.args,'--unknown-option']]){
  const before=`[mcp_servers.godot-mcp]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify(args)}\n`;await writeFile(h.file,before);
  await expect(prepareCodexUpgrade(h.file,h.entry)).rejects.toMatchObject({code:'UPGRADE_CONFIG_UNRECOGNIZED'});expect(await readFile(h.file,'utf8')).toBe(before);
 }
});

it('refuses linked server manifests and missing wrappers even when replacement is requested',async()=>{
 const h=await fixture(),local=await localLauncher(h);const alias=path.join(h.root,'manifest-alias.json');
 await link(path.join(local.checkout,'packages/server/package.json'),alias);
 await expect(prepareCodexUpgrade(h.file,h.entry)).rejects.toMatchObject({code:'UPGRADE_CONFIG_UNRECOGNIZED'});
 const fresh=await fixture(),other=await localLauncher(fresh);
 await writeFile(fresh.file,other.before.replaceAll(other.wrapperPath.replaceAll('\\','\\\\'),path.join(fresh.root,'missing.mjs').replaceAll('\\','\\\\')));
 await expect(prepareCodexUpgrade(fresh.file,fresh.entry)).rejects.toMatchObject({code:'UPGRADE_CONFIG_UNRECOGNIZED'});
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
