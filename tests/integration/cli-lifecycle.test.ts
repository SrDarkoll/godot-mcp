import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {expect,it} from 'vitest';
it.each(['{"bridgePort":"invalid"}','{broken json'])('keeps CLI status/doctor/stop usable with corrupt config %s',async(invalidConfig)=>{
 const parent=path.resolve('.godot-mcp/cli-test-runs');await mkdir(parent,{recursive:true});const root=await mkdtemp(path.join(parent,'cli-'));
 await writeFile(path.join(root,'project.godot'),'config_version=5\n[application]\nconfig/name="CLI fixture"\n');
 const entry=path.resolve('packages/cli/dist/index.js');
 const help=spawnSync(process.execPath,[entry,'--help'],{encoding:'utf8',windowsHide:true});expect(help.status).toBe(0);expect(help.stdout).toContain('sessions inspect');
 const client=new Client({name:'cli-test',version:'1'});const transport=new StdioClientTransport({command:process.execPath,args:[entry,'start',root,'--bridge-port','0']});
 try{
  await client.connect(transport);const live=await client.callTool({name:'session.status',arguments:{}});expect(live.isError).not.toBe(true);
  const status=spawnSync(process.execPath,[entry,'status',root,'--json'],{encoding:'utf8',windowsHide:true,timeout:10000});expect(status.status,status.stderr).toBe(0);
  const parsed=JSON.parse(status.stdout);expect(parsed.state).toBe('running');expect(parsed.editorConnected).toBe(false);expect(status.stdout).not.toContain('"token"');
  await writeFile(path.join(root,'.godot-mcp/config.json'),invalidConfig);
  const stillLive=spawnSync(process.execPath,[entry,'status',root,'--json'],{encoding:'utf8',windowsHide:true,timeout:10000});expect(stillLive.status,stillLive.stdout).toBe(0);
  const diagnosed=spawnSync(process.execPath,[entry,'doctor',root,'--godot',process.execPath,'--json'],{encoding:'utf8',windowsHide:true,timeout:10000});
  expect(diagnosed.status).toBe(1);expect(JSON.parse(diagnosed.stdout).checks).toContainEqual(expect.objectContaining({id:'protocol',ok:false}));
  const stop=spawnSync(process.execPath,[entry,'stop',root,'--json'],{encoding:'utf8',windowsHide:true,timeout:35000});expect(stop.status,stop.stderr).toBe(0);expect(JSON.parse(stop.stdout).stopped).toBe(true);
  const manifest=JSON.parse(await readFile(path.join(root,'.godot-mcp/sessions',parsed.sessionId,'manifest.json'),'utf8'));expect(manifest.endedAt).toEqual(expect.any(String));
  const repaired=spawnSync(process.execPath,[entry,'config',root,'--repair','--bridge-port','12345','--json'],{encoding:'utf8',windowsHide:true,timeout:10000});
  expect(repaired.status,repaired.stdout+repaired.stderr).toBe(0);
  const repairedConfig=JSON.parse(repaired.stdout);
  expect(repairedConfig).toMatchObject({protocol:1,bridgePort:12345,saved:true,restartRequired:true});
  expect(await readFile(repairedConfig.backupPath,'utf8')).toBe(invalidConfig);
 }finally{await client.close();}
},45000);
