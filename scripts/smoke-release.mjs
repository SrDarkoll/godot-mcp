import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {packRelease,npm} from './pack-release.mjs';

const packed=await packRelease();
const consumer=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-consumer-'));
await fs.writeFile(path.join(consumer,'package.json'),JSON.stringify({name:'godot-mcp-consumer',version:'1.0.0',private:true,type:'module'}));
npm(['install','--ignore-scripts','--no-audit','--no-fund',...packed.packages.map(pkg=>path.join(packed.out,pkg.filename))],consumer);
const entry=path.join(consumer,'node_modules/@godot-mcp/cli/dist/index.js');
assert((await fs.realpath(entry)).startsWith(consumer+path.sep));
const project=path.join(consumer,'Game With Spaces');await fs.mkdir(project);
await fs.writeFile(path.join(project,'project.godot'),'config_version=5\n[application]\nconfig/name="Package consumer"\n');
function cli(args){const result=spawnSync(process.execPath,[entry,...args],{cwd:consumer,encoding:'utf8',windowsHide:true,timeout:40000});assert.equal(result.status,0,result.stderr||result.stdout);return result.stdout;}
assert(cli(['--help']).includes('sessions inspect'));
const initialized=JSON.parse(cli(['init',project,'--json']));assert.equal(initialized.projectRoot,project);
if(process.env.GODOT_BIN)cli(['config',project,'--godot',process.env.GODOT_BIN,'--json']);
await fs.stat(path.join(project,'addons/godot_mcp/plugin.gd'));
const recipe=JSON.parse(cli(['setup','codex',project,'--json']));assert.equal(recipe.changedProfile,false);assert(recipe.command.some(arg=>arg.startsWith(consumer)&&arg.endsWith('server'+path.sep+'dist'+path.sep+'index.js')));
const client=new Client({name:'package-consumer',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[entry,'start',project,'--bridge-port','0'],cwd:consumer});
const checks=['independent npm install','CLI help','addon init','Codex recipe','MCP session.status','session metrics','hashed session export','authenticated status and stop'];
try{
 await client.connect(transport);const status=await client.callTool({name:'session.status',arguments:{}});assert.equal(status.isError,undefined);assert.equal(status.structuredContent.projectRoot,project);
 const toolNames=(await client.listTools()).tools.map(tool=>tool.name);for(const name of ['scene.batch','scene.batch.preview','project.events','resource.dependencies','resource.impact','editor.import_resources','visual.compare','performance.snapshot','performance.compare'])assert(toolNames.includes(name),`Missing packaged tool: ${name}`);checks.push('advanced tool registration');
 const eventPage=await client.callTool({name:'project.events',arguments:{}});assert.notEqual(eventPage.isError,true);assert.equal(eventPage.structuredContent.sessionId,status.structuredContent.sessionId);
 const live=JSON.parse(cli(['status',project,'--json']));assert.equal(live.state,'running');
 const metrics=await client.callTool({name:'session.metrics',arguments:{}});assert.notEqual(metrics.isError,true);assert(metrics.structuredContent.memory.rss>0);
 const bundle=await client.callTool({name:'session.export',arguments:{}});assert.notEqual(bundle.isError,true);assert.equal(bundle.structuredContent.complete,true);
 const exported=JSON.parse(await fs.readFile(path.join(bundle.structuredContent.path,'export.json'),'utf8'));assert.equal(exported.complete,true);assert.equal(exported.files.length,2);
 const begun=await client.callTool({name:'transaction.begin',arguments:{label:'Package diff',paths:['res://preview.json'],atomic:true}});assert.notEqual(begun.isError,true);
 const transaction_id=begun.structuredContent.id;
 assert.notEqual((await client.callTool({name:'transaction.write_file',arguments:{transaction_id,path:'res://preview.json',content:'{"preview":true}\n'}})).isError,true);
 const diff=await client.callTool({name:'transaction.diff',arguments:{transaction_id}});assert.notEqual(diff.isError,true);assert(diff.structuredContent.files[0].diff.includes('+{"preview":true}'));
 assert.notEqual((await client.callTool({name:'transaction.rollback',arguments:{transaction_id}})).isError,true);checks.push('transaction diff without publication');
 if(process.env.GODOT_BIN){
  const validation=await client.callTool({name:'project.validate',arguments:{timeout_ms:60000}});assert.notEqual(validation.isError,true,JSON.stringify(validation.structuredContent));assert.equal(validation.structuredContent.valid,true,JSON.stringify(validation.structuredContent));
  checks.push('headless project validation');
 }
 const stopped=JSON.parse(cli(['stop',project,'--json']));assert.equal(stopped.stopped,true);
}finally{await client.close();}
await fs.writeFile(path.join(packed.out,'consumer-validation.json'),JSON.stringify({passed:true,consumer,project,checks},null,2));
console.log(JSON.stringify({passed:true,artifacts:packed.out,consumer}));
