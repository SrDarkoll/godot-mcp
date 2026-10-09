import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {packRelease,npm} from './pack-release.mjs';

const packed=await packRelease();
const consumer=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-consumer-')));
await fs.writeFile(path.join(consumer,'package.json'),JSON.stringify({name:'godot-mcp-consumer',version:'1.0.0',private:true,type:'module'}));
npm(['install','--ignore-scripts','--no-audit','--no-fund',path.join(packed.out,packed.pkg.filename)],consumer);
const publicRoot=path.join(consumer,'node_modules/@srdarkx/godot-mcp');
const entry=path.join(publicRoot,'dist/index.js');
assert((await fs.realpath(entry)).startsWith((await fs.realpath(publicRoot))+path.sep));
await fs.stat(path.join(publicRoot,'node_modules/@godot-mcp/protocol/dist/index.js'));
await fs.stat(path.join(publicRoot,'node_modules/@godot-mcp/server/dist/index.js'));
await fs.stat(path.join(publicRoot,'node_modules/@godot-mcp/godot-addon/addons/godot_mcp/plugin.gd'));
await fs.stat(path.join(publicRoot,'node_modules/@godot-mcp/godot-addon/addons/godot_mcp/runtime/runtime_logger_46.gd.txt'));
const project=path.join(consumer,'Game With Spaces');
await fs.mkdir(project);
await fs.writeFile(path.join(project,'project.godot'),'config_version=5\n[application]\nconfig/name="Package consumer"\n');
function cli(args){
 const result=spawnSync(process.execPath,[entry,...args],{cwd:consumer,encoding:'utf8',windowsHide:true,timeout:40000});
 assert.equal(result.status,0,result.stderr||result.stdout);
 return result.stdout;
}
assert(cli(['--help']).includes('--client <antigravity|cursor|claude|codex>'));
const initialized=JSON.parse(cli(['init',project,'--client','cursor','--tool-profile','2d','--json']));
assert.equal(initialized.projectRoot,project);
assert.equal(initialized.client.client,'cursor');
await fs.stat(path.join(project,'addons/godot_mcp/plugin.gd'));
const projectConfig=JSON.parse(await fs.readFile(path.join(project,'.godot-mcp/config.json'),'utf8'));
assert.equal(projectConfig.toolProfile,'2d');
const clientConfig=JSON.parse(await fs.readFile(path.join(project,'.cursor/mcp.json'),'utf8'));
assert.deepEqual(clientConfig.mcpServers['godot-mcp'],{command:'npx',args:['--yes',`@srdarkx/godot-mcp@${packed.pkg.version}`,'start',project,'--tool-profile','2d']});
const codexInit=JSON.parse(cli(['upgrade',project,'--client','codex','--tool-profile','2d','--yes','--json']));
assert.equal(codexInit.client.client,'codex');
assert.equal(codexInit.doctor.ok,true);
assert.equal(codexInit.client.path,path.join(project,'.codex','config.toml'));
const codexConfig=await fs.readFile(codexInit.client.path,'utf8');
assert(codexConfig.includes('[mcp_servers.godot-mcp]'));
assert(codexConfig.includes('command = "npx"'));
assert.deepEqual(JSON.parse(codexConfig.match(/^args = (.+)$/m)?.[1]??'null'),
 ['--yes',`@srdarkx/godot-mcp@${packed.pkg.version}`,'start',project,'--tool-profile','2d']);
const wrapper=path.join(project,'retry.mjs'),wrapperBytes='throw new Error("Upgrade inspection must not execute a custom launcher");\n';
await fs.writeFile(wrapper,wrapperBytes);
const bundledServer=path.join(publicRoot,'node_modules/@godot-mcp/server/dist/index.js');
const legacy=`[mcp_servers.godot-mcp]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([wrapper,bundledServer,'--project',project,'--tool-profile','2d'])}\nrequired = true\nstartup_timeout_sec = 45\n`;
await fs.writeFile(codexInit.client.path,legacy);
const preview=JSON.parse(cli(['upgrade',project,'--dry-run','--yes','--json']));
assert.equal(preview.dryRun,true);assert.equal(preview.filesChanged,false);
assert.equal(preview.requires.replaceLauncher,true);assert.equal(preview.client.launcherReplacement.kind,'wrapper');
assert.equal(await fs.readFile(codexInit.client.path,'utf8'),legacy);
const unapproved=spawnSync(process.execPath,[entry,'upgrade',project,'--yes','--json'],{cwd:consumer,encoding:'utf8',windowsHide:true,timeout:40000});
assert.equal(unapproved.status,1,unapproved.stderr||unapproved.stdout);
assert.equal(JSON.parse(unapproved.stdout).error.code,'LAUNCHER_REPLACEMENT_REQUIRED');
assert.equal(await fs.readFile(codexInit.client.path,'utf8'),legacy);
const migrated=JSON.parse(cli(['upgrade',project,'--replace-launcher','--yes','--json']));
assert.equal(migrated.doctor.ok,true);assert.equal(migrated.client.launcherReplaced,true);
assert.equal(await fs.readFile(path.join(migrated.backupPath,'before/.codex/config.toml'),'utf8'),legacy);
assert.equal(await fs.readFile(wrapper,'utf8'),wrapperBytes);
const migratedCodex=await fs.readFile(codexInit.client.path,'utf8');
assert(migratedCodex.includes('required = true'));assert(migratedCodex.includes('startup_timeout_sec = 45'));
const recipe=JSON.parse(cli(['setup','codex',project,'--json']));
assert.equal(recipe.changedProfile,false);
const publicReal=await fs.realpath(publicRoot);
assert(recipe.command.some(arg=>arg.startsWith(publicReal+path.sep)&&arg.endsWith('server'+path.sep+'dist'+path.sep+'index.js')));
const client=new Client({name:'package-consumer',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[entry,'start',project,'--bridge-port','0'],cwd:consumer});
try{
 await client.connect(transport);
 const status=await client.callTool({name:'session.status',arguments:{}});
 assert.equal(status.isError,undefined);
 assert.equal(status.structuredContent.projectRoot,project);
 const live=JSON.parse(cli(['status',project,'--json']));
 assert.equal(live.state,'running');
 const stopped=JSON.parse(cli(['stop',project,'--json']));
 assert.equal(stopped.stopped,true);
}finally{
 await client.close();
}
await fs.writeFile(path.join(packed.out,'consumer-validation.json'),JSON.stringify({
 passed:true,
 consumer,
 project,
 checks:[
  'one public tarball install',
  'bundled protocol entry',
  'bundled server entry',
  'bundled addon plugin',
  'bundled runtime logger',
  'CLI help',
  'upgrade preview without writes',
  'explicit wrapper migration consent',
  'exact custom configuration backup and retained wrapper',
  'addon init',
  'scoped client bootstrap',
  'tool profile persistence',
  'Codex project config and recipe inside public package',
  'MCP session.status',
  'authenticated status and stop'
 ]
},null,2));
console.log(JSON.stringify({passed:true,artifacts:packed.out,consumer}));
