import {spawn,type ChildProcess} from 'node:child_process';
import {cp,mkdir,mkdtemp,readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {expect,it,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {initProject} from '../../packages/cli/src/init/init-project.js';
import {upgradeProject} from '../../packages/cli/src/upgrade/upgrade-project.js';
import {previewUpgrade} from '../../packages/cli/src/upgrade/upgrade-preview.js';
import {parse} from 'smol-toml';
import {ProjectLease} from '@godot-mcp/server/project-lease';
import {SERVER_VERSION} from '@godot-mcp/protocol';

const godot=process.env.GODOT_BIN;
async function fixture(){
 const parent=path.resolve('.godot-mcp/cli-test-runs');await mkdir(parent,{recursive:true});const root=await mkdtemp(path.join(parent,'upgrade-'));
 await cp(path.resolve('fixtures/empty-project'),root,{recursive:true});
 await initProject({projectRoot:root,godotBin:godot!,enable:true});
 await mkdir(path.join(root,'.codex'),{recursive:true});
 const toml=`model = "keep-model"\n[mcp_servers.godot-mcp]\ncommand = "npx"\nargs = ${JSON.stringify(['--yes','@srdarkx/godot-mcp@0.5.3','start',root,'--tool-profile','2d'])}\nstartup_timeout_sec = 90\n[mcp_servers.other]\ncommand = "other"\n`;
 await writeFile(path.join(root,'.codex/config.toml'),toml);
 await writeFile(path.join(root,'addons/godot_mcp/plugin.cfg'),(await readFile(path.join(root,'addons/godot_mcp/plugin.cfg'),'utf8')).replace(/^version="[^"]+"/m,'version="0.5.3"'));
 return {root,toml};
}

it.skipIf(!godot)('upgrades a legacy Codex launch with staged Godot settings and retains exact backups',async()=>{
 const h=await fixture();const result=await upgradeProject({projectRoot:h.root,godotBin:godot!});
 expect(result).toMatchObject({fromVersion:'0.5.3',toVersion:SERVER_VERSION,doctor:{ok:true},client:{migrated:true}});
 expect(await readFile(path.join(result.backupPath,'before/.codex/config.toml'),'utf8')).toBe(h.toml);
 const text=await readFile(path.join(h.root,'.codex/config.toml'),'utf8');
 expect(text).toContain(`@srdarkx/godot-mcp@${SERVER_VERSION}`);expect(text).toContain('startup_timeout_sec = 90');expect(text).toContain('[mcp_servers.other]\ncommand = "other"');
 await expect(readFile(path.join(h.root,'.godot-mcp/runtime/recovery.json'))).rejects.toMatchObject({code:'ENOENT'});
 const again=await upgradeProject({projectRoot:h.root,godotBin:godot!});expect(again.client?.migrated).toBe(false);expect(again.doctor.ok).toBe(true);
},60000);

async function customLauncher(h:Awaited<ReturnType<typeof fixture>>){
 const wrapper=path.join(h.root,'scripts/godot_mcp_retry.mjs');await mkdir(path.dirname(wrapper),{recursive:true});
 const bytes=`import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const args=process.argv.slice(2),deadline=Date.now()+30000;
let active=null,stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stopping=true;active?.kill(signal);});
while(!stopping){
 let stderr='';active=spawn(process.execPath,args,{stdio:['inherit','inherit','pipe'],windowsHide:true});
 active.stderr.setEncoding('utf8');active.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-65536);});
 const code=await new Promise((resolve,reject)=>{active.once('error',reject);active.once('close',resolve);});active=null;
 if(stopping||code===0){if(stderr)process.stderr.write(stderr);break;}
 if(stderr.includes('PROJECT_BUSY')&&Date.now()<deadline){await delay(450);continue;}
 if(stderr)process.stderr.write(stderr);process.exitCode=code??1;break;
}
`;
 await writeFile(wrapper,bytes);
 const args=[wrapper,path.resolve('packages/server/dist/index.js'),'--project',h.root,'--bridge-port','0','--tool-profile','2d'];
 const toml=`model = "keep-model"\n[mcp_servers.godot-mcp]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify(args)}\nrequired = true\nstartup_timeout_sec = 45\n[mcp_servers.godot-mcp.env]\nKEEP = "yes"\n[mcp_servers.other]\ncommand = "keep-other"\n`;
 await writeFile(path.join(h.root,'.codex/config.toml'),toml);
 return {wrapper,bytes,args,toml};
}

it.skipIf(!godot)('previews and cancels a live wrapper launch, then migrates it with one combined confirmation',async()=>{
 const h=await fixture(),custom=await customLauncher(h),client=new Client({name:'wrapper-upgrade-test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:custom.args});await client.connect(transport);
 const files=['project.godot','.gitignore','addons/godot_mcp/plugin.cfg','.codex/config.toml','.godot-mcp/config.json','scripts/godot_mcp_retry.mjs'];
 const before=await Promise.all(files.map(file=>readFile(path.join(h.root,file))));
 try{
  const id=((await client.callTool({name:'session.status',arguments:{}})).structuredContent as any).sessionId;
  expect(await previewUpgrade({projectRoot:h.root})).toMatchObject({requires:{stopSession:true,replaceLauncher:true},session:{sessionId:id},client:{launcherReplacement:{kind:'wrapper',wrapperPath:custom.wrapper}}});
  await expect(upgradeProject({projectRoot:h.root,godotBin:godot!,yes:true})).rejects.toMatchObject({code:'LAUNCHER_REPLACEMENT_REQUIRED'});
  await expect(upgradeProject({projectRoot:h.root,godotBin:godot!,confirmUpgrade:async()=>false})).rejects.toMatchObject({code:'UPGRADE_CANCELLED'});
  for(let index=0;index<files.length;index++)expect(await readFile(path.join(h.root,files[index]!))).toEqual(before[index]);
  await expect(readdir(path.join(h.root,'.godot-mcp/upgrade-backups'))).rejects.toMatchObject({code:'ENOENT'});
  expect((await client.callTool({name:'session.status',arguments:{}})).structuredContent).toMatchObject({sessionId:id});
  let confirmations=0;
  const result=await upgradeProject({projectRoot:h.root,godotBin:godot!,confirmUpgrade:async preview=>{
   confirmations++;expect(preview.requires).toEqual({stopSession:true,replaceLauncher:true});expect(preview.session?.sessionId).toBe(id);return true;
  }});
  expect(confirmations).toBe(1);expect(result).toMatchObject({serverStopped:true,doctor:{ok:true},client:{migrated:true,launcherReplaced:true}});
  expect(await readFile(path.join(result.backupPath,'before/.codex/config.toml'),'utf8')).toBe(custom.toml);
  const parsed=parse(await readFile(path.join(h.root,'.codex/config.toml'),'utf8')) as any;
  expect(parsed.mcp_servers['godot-mcp']).toMatchObject({command:'npx',required:true,startup_timeout_sec:45,env:{KEEP:'yes'}});
  expect(parsed.mcp_servers.other.command).toBe('keep-other');expect(parsed.mcp_servers['godot-mcp'].args).toContain(`@srdarkx/godot-mcp@${SERVER_VERSION}`);
  expect(await readFile(custom.wrapper,'utf8')).toBe(custom.bytes);
 }finally{await client.close().catch(()=>{});}
},60000);

it.skipIf(!godot)('restores the custom launcher and all installation bytes on doctor failure',async()=>{
 const h=await fixture(),custom=await customLauncher(h);
 const files=['project.godot','.gitignore','addons/godot_mcp/plugin.cfg','.codex/config.toml','.godot-mcp/config.json','scripts/godot_mcp_retry.mjs'];
 const before=await Promise.all(files.map(file=>readFile(path.join(h.root,file))));
 await expect(upgradeProject({projectRoot:h.root,godotBin:godot!,replaceLauncher:true,verify:async()=>({ok:false,checks:[{id:'injected',ok:false,detail:'forced doctor failure'}]})})).rejects.toMatchObject({code:'UPGRADE_VALIDATION_FAILED',details:{restored:true}});
 for(let index=0;index<files.length;index++)expect(await readFile(path.join(h.root,files[index]!))).toEqual(before[index]);
 expect(await readFile(custom.wrapper,'utf8')).toBe(custom.bytes);
 await expect(readFile(path.join(h.root,'.godot-mcp/runtime/recovery.json'))).rejects.toMatchObject({code:'ENOENT'});
},60000);

it.skipIf(!godot).each(['existing','absent'])('preserves a %s Codex config changed during consent and leaves the live session running',async state=>{
 const h=await fixture(),custom=await customLauncher(h),client=new Client({name:'wrapper-upgrade-race-test',version:'1'});
 if(state==='absent')await unlink(path.join(h.root,'.codex/config.toml'));
 await client.connect(new StdioClientTransport({command:process.execPath,args:custom.args}));
 try{
  const id=((await client.callTool({name:'session.status',arguments:{}})).structuredContent as any).sessionId;
  const edited=custom.toml+'# concurrent human edit\n';
  await expect(upgradeProject({projectRoot:h.root,godotBin:godot!,confirmUpgrade:async()=>{await writeFile(path.join(h.root,'.codex/config.toml'),edited);return true;}})).rejects.toMatchObject({code:'UPGRADE_PLAN_CHANGED'});
  expect(await readFile(path.join(h.root,'.codex/config.toml'),'utf8')).toBe(edited);
  expect((await client.callTool({name:'session.status',arguments:{}})).structuredContent).toMatchObject({sessionId:id});
  await expect(readdir(path.join(h.root,'.godot-mcp/upgrade-backups'))).rejects.toMatchObject({code:'ENOENT'});
 }finally{await client.close().catch(()=>{});}
},60000);

it.skipIf(!godot)('reports a stopped session when the maintenance lease fails after approved shutdown',async()=>{
 const h=await fixture(),client=new Client({name:'upgrade-lease-failure-test',version:'1'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/server/dist/index.js'),'--project',h.root,'--bridge-port','0']}));
 const acquire=vi.spyOn(ProjectLease,'acquire').mockRejectedValueOnce(Object.assign(new Error('Injected maintenance contention'),{code:'PROJECT_BUSY'}));
 try{
  await expect(upgradeProject({projectRoot:h.root,godotBin:godot!,yes:true})).rejects.toMatchObject({code:'PROJECT_BUSY',details:{serverStopped:true,installationApplied:false},message:expect.stringContaining('session remains stopped')});
  expect(await readFile(path.join(h.root,'.codex/config.toml'),'utf8')).toBe(h.toml);
 }finally{acquire.mockRestore();await client.close().catch(()=>{});}
},60000);

it.skipIf(!godot)('restores the previous addon, settings and Codex bytes when doctor fails',async()=>{
 const h=await fixture();const files=['project.godot','addons/godot_mcp/plugin.cfg','.codex/config.toml','.godot-mcp/config.json'];
 const before=await Promise.all(files.map(file=>readFile(path.join(h.root,file))));
 await expect(upgradeProject({projectRoot:h.root,godotBin:godot!,verify:async()=>({ok:false,checks:[{id:'runtime',ok:false,detail:'injected verification failure'}]})})).rejects.toMatchObject({code:'UPGRADE_VALIDATION_FAILED',details:{restored:true,backupPath:expect.any(String)}});
 for(let index=0;index<files.length;index++)expect(await readFile(path.join(h.root,files[index]!))).toEqual(before[index]);
 await expect(readFile(path.join(h.root,'.godot-mcp/runtime/recovery.json'))).rejects.toMatchObject({code:'ENOENT'});
},60000);

it.skipIf(!godot)('leaves a live session untouched without consent, then stops it through authenticated management',async()=>{
 const h=await fixture();const client=new Client({name:'upgrade-test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/server/dist/index.js'),'--project',h.root,'--bridge-port','0']});
 await client.connect(transport);
 try{
  const live=await client.callTool({name:'session.status',arguments:{}});const id=(live.structuredContent as any).sessionId;
  await expect(upgradeProject({projectRoot:h.root,godotBin:godot!})).rejects.toMatchObject({code:'CONFIRMATION_REQUIRED'});
  await expect(upgradeProject({projectRoot:h.root,godotBin:godot!,confirmStop:async()=>false})).rejects.toMatchObject({code:'UPGRADE_CANCELLED'});
  expect(await readFile(path.join(h.root,'.codex/config.toml'),'utf8')).toBe(h.toml);
  expect((await client.callTool({name:'session.status',arguments:{}})).structuredContent).toMatchObject({sessionId:id});
  const result=await upgradeProject({projectRoot:h.root,godotBin:godot!,confirmStop:async status=>{expect(status.sessionId).toBe(id);return true;}});
  expect(result).toMatchObject({serverStopped:true,doctor:{ok:true},client:{migrated:true}});
 }finally{await client.close().catch(()=>{});}
},60000);
