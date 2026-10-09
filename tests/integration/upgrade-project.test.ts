import {spawn,type ChildProcess} from 'node:child_process';
import {cp,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,it} from 'vitest';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {initProject} from '../../packages/cli/src/init/init-project.js';
import {upgradeProject} from '../../packages/cli/src/upgrade/upgrade-project.js';
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
