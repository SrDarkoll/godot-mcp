import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {expect,it} from 'vitest';
it('rejects a second server and addon update while the first owns the project',async()=>{
 const parent=path.resolve('.godot-mcp/cli-test-runs');await mkdir(parent,{recursive:true});
 const root=await mkdtemp(path.join(parent,'exclusion-'));
 await writeFile(path.join(root,'project.godot'),'config_version=5\n');
 const entry=path.resolve('packages/cli/dist/index.js');
 const client=new Client({name:'exclusive-test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[entry,'start',root,'--bridge-port','0']});
 try{
  await client.connect(transport);
  const descriptor=await readFile(path.join(root,'.godot-mcp/runtime/bridge.json'),'utf8');
  const second=spawnSync(process.execPath,[entry,'start',root,'--bridge-port','0'],{encoding:'utf8',windowsHide:true,timeout:5000});
  expect(second.stderr).toContain('PROJECT_BUSY');
  expect(await readFile(path.join(root,'.godot-mcp/runtime/bridge.json'),'utf8')).toBe(descriptor);
  const update=spawnSync(process.execPath,[entry,'addon','update',root,'--json'],{encoding:'utf8',windowsHide:true,timeout:5000});
  expect(update.status).toBe(1);expect(update.stdout).toContain('PROJECT_BUSY');
  expect((await client.callTool({name:'session.status',arguments:{}})).isError).not.toBe(true);
 }finally{await client.close();}
},20000);
it('refuses to start against an interrupted addon installation',async()=>{
 const parent=path.resolve('.godot-mcp/cli-test-runs');await mkdir(parent,{recursive:true});
 const root=await mkdtemp(path.join(parent,'addon-barrier-'));
 await writeFile(path.join(root,'project.godot'),'config_version=5\n');
 await mkdir(path.join(root,'.godot-mcp/runtime'),{recursive:true});
 await writeFile(path.join(root,'.godot-mcp/runtime/addon-update.json'),'pending');
 const result=spawnSync(process.execPath,[path.resolve('packages/cli/dist/index.js'),'start',root,'--bridge-port','0'],{encoding:'utf8',windowsHide:true,timeout:5000});
 expect(result.status).toBe(1);expect(result.stderr).toContain('recover the interrupted addon installation');
 expect(await readFile(path.join(root,'.godot-mcp/runtime/addon-update.json'),'utf8')).toBe('pending');
});
