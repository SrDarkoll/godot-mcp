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
npm(['install','--ignore-scripts','--no-audit','--no-fund',...packed.packages.map(pkg=>path.join(packed.out,pkg.filename))],consumer);
const entry=path.join(consumer,'node_modules/@godot-mcp/cli/dist/index.js');
assert((await fs.realpath(entry)).startsWith(consumer+path.sep));
const project=path.join(consumer,'Game With Spaces');await fs.mkdir(project);
await fs.writeFile(path.join(project,'project.godot'),'config_version=5\n[application]\nconfig/name="Package consumer"\n');
function cli(args){const result=spawnSync(process.execPath,[entry,...args],{cwd:consumer,encoding:'utf8',windowsHide:true,timeout:40000});assert.equal(result.status,0,result.stderr||result.stdout);return result.stdout;}
assert(cli(['--help']).includes('--client <antigravity|cursor|claude>'));
const initialized=JSON.parse(cli(['init',project,'--client','cursor','--tool-profile','2d','--json']));assert.equal(initialized.projectRoot,project);assert.equal(initialized.client.client,'cursor');
await fs.stat(path.join(project,'addons/godot_mcp/plugin.gd'));
const projectConfig=JSON.parse(await fs.readFile(path.join(project,'.godot-mcp/config.json'),'utf8'));assert.equal(projectConfig.toolProfile,'2d');
const clientConfig=JSON.parse(await fs.readFile(path.join(project,'.cursor/mcp.json'),'utf8'));assert.deepEqual(clientConfig.mcpServers['godot-mcp'],{command:'npx',args:['--yes','@godot-mcp/cli','start',project,'--tool-profile','2d']});
const recipe=JSON.parse(cli(['setup','codex',project,'--json']));assert.equal(recipe.changedProfile,false);assert(recipe.command.some(arg=>arg.startsWith(consumer)&&arg.endsWith('server'+path.sep+'dist'+path.sep+'index.js')));
const client=new Client({name:'package-consumer',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[entry,'start',project,'--bridge-port','0'],cwd:consumer});
try{
 await client.connect(transport);const status=await client.callTool({name:'session.status',arguments:{}});assert.equal(status.isError,undefined);assert.equal(status.structuredContent.projectRoot,project);
 const live=JSON.parse(cli(['status',project,'--json']));assert.equal(live.state,'running');
 const stopped=JSON.parse(cli(['stop',project,'--json']));assert.equal(stopped.stopped,true);
}finally{await client.close();}
await fs.writeFile(path.join(packed.out,'consumer-validation.json'),JSON.stringify({passed:true,consumer,project,checks:['independent npm install','CLI help','addon init','client bootstrap','tool profile persistence','Codex recipe','MCP session.status','authenticated status and stop']},null,2));
console.log(JSON.stringify({passed:true,artifacts:packed.out,consumer}));
