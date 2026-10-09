import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {afterEach,expect,it,vi} from 'vitest';
import {runCli} from '../src/cli-runner.js';
import {parseCliArgs} from '../src/cli-args.js';

vi.mock('node:readline/promises',()=>({createInterface:vi.fn()}));

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

async function wrapperFixture(){
 const root=await fixture();await mkdir(path.join(root,'.codex'));await mkdir(path.join(root,'scripts'));
 const wrapper=path.join(root,'scripts/retry.mjs');await writeFile(wrapper,'throw new Error("preview must not execute this script");\n');
 const server=fileURLToPath(new URL('../../server/dist/index.js',import.meta.url));
 const before=`[mcp_servers.godot-mcp]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([wrapper,server,'--project',root])}\nrequired = true\nstartup_timeout_sec = 45\n`;
 await writeFile(path.join(root,'.codex/config.toml'),before);return {root,wrapper,before};
}

async function snapshot(root:string,relative=''):Promise<Record<string,string>>{
 const result:Record<string,string>={};
 for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
  const name=path.join(relative,entry.name);
  if(entry.isDirectory())Object.assign(result,await snapshot(root,name));else result[name]=(await readFile(path.join(root,name))).toString('base64');
 }
 return result;
}

it('accepts upgrade preview and explicit replacement options only for the applicable commands',()=>{
 expect(parseCliArgs(['upgrade','.','--dry-run','--replace-launcher','--yes','--json'])).toMatchObject({command:'upgrade',dryRun:true,replaceLauncher:true,yes:true,json:true});
 expect(parseCliArgs(['init','.','--replace-launcher'])).toMatchObject({replaceLauncher:true});
 expect(()=>parseCliArgs(['stop','--dry-run'])).toThrow();expect(()=>parseCliArgs(['doctor','--replace-launcher'])).toThrow();
 expect(()=>parseCliArgs(['upgrade','--dry-run','--dry-run'])).toThrow();
});

it('previews the wrapper migration without Godot discovery, writes, backups or executing the launcher',async()=>{
 const h=await wrapperFixture(),before=await snapshot(h.root),messages:string[]=[];vi.spyOn(console,'log').mockImplementation(v=>messages.push(String(v)));
 expect(await runCli(['upgrade',h.root,'--dry-run','--yes','--replace-launcher','--godot',path.join(h.root,'missing-godot.exe'),'--json'])).toBe(0);
 expect(JSON.parse(messages.at(-1)!)).toMatchObject({dryRun:true,filesChanged:false,requires:{replaceLauncher:true,stopSession:false},client:{launcherReplacement:{kind:'wrapper',wrapperPath:h.wrapper},proposedLaunch:{command:'npx'}}});
 expect(await snapshot(h.root)).toEqual(before);
});

it('keeps a custom launch intact with --yes and gives a complete explicit approval command',async()=>{
 const h=await wrapperFixture(),before=await snapshot(h.root),messages:string[]=[];vi.spyOn(console,'log').mockImplementation(v=>messages.push(String(v)));
 expect(await runCli(['upgrade',h.root,'--godot',process.execPath,'--yes','--json'])).toBe(1);
 const response=JSON.parse(messages.at(-1)!);expect(response).toMatchObject({error:{code:'LAUNCHER_REPLACEMENT_REQUIRED',details:{command:expect.stringContaining('--replace-launcher'),preview:{requires:{replaceLauncher:true}}}}});
 expect(await snapshot(h.root)).toEqual(before);
});

it('routes a detected custom Codex installation from init to upgrade without editing it',async()=>{
 const h=await wrapperFixture(),before=await snapshot(h.root),messages:string[]=[];vi.spyOn(console,'log').mockImplementation(v=>messages.push(String(v)));
 expect(await runCli(['init',h.root,'--json'])).toBe(1);
 expect(JSON.parse(messages.at(-1)!)).toMatchObject({error:{code:'UPGRADE_AVAILABLE'}});expect(await snapshot(h.root)).toEqual(before);
});

it.each(['upgrade','init'])('asks once in interactive %s with redirected output and cancels without changes',async command=>{
 const h=await wrapperFixture(),before=await snapshot(h.root);
 const stdinDescriptor=Object.getOwnPropertyDescriptor(process.stdin,'isTTY'),stderrDescriptor=Object.getOwnPropertyDescriptor(process.stderr,'isTTY');
 Object.defineProperty(process.stdin,'isTTY',{configurable:true,value:true});Object.defineProperty(process.stderr,'isTTY',{configurable:true,value:false});
 const question=vi.fn().mockResolvedValue('n'),close=vi.fn();vi.mocked(createInterface).mockReturnValue({question,close} as any);
 const errors:string[]=[];vi.spyOn(console,'error').mockImplementation(value=>errors.push(String(value)));
 try{
  expect(await runCli([command,h.root,'--godot',process.execPath])).toBe(1);
  expect(question).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledOnce();
  expect(errors.at(-1)).toContain('Upgrade cancelled');expect(await snapshot(h.root)).toEqual(before);
 }finally{
  if(stdinDescriptor)Object.defineProperty(process.stdin,'isTTY',stdinDescriptor);else Reflect.deleteProperty(process.stdin,'isTTY');
  if(stderrDescriptor)Object.defineProperty(process.stderr,'isTTY',stderrDescriptor);else Reflect.deleteProperty(process.stderr,'isTTY');
 }
});
