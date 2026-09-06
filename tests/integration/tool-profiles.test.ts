import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, expect, test } from 'vitest';
import { initProject } from '../../packages/cli/src/init/init-project.js';
import { toolNamesForProfile } from '../../packages/server/src/tooling/tool-catalog.js';

const fixtureRoot=path.resolve('fixtures/empty-project');
const tempRoots:string[]=[];

async function waitFor(predicate:()=>boolean|Promise<boolean>,timeoutMs:number):Promise<boolean>{
  const started=Date.now();
  while(Date.now()-started<timeoutMs){if(await predicate())return true;await new Promise(resolve=>setTimeout(resolve,50));}
  return await predicate();
}
async function stopProcess(child:ChildProcess|null):Promise<void>{
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  child.kill();
  await Promise.race([new Promise<void>(resolve=>child.once('exit',()=>resolve())),new Promise<void>(resolve=>setTimeout(resolve,2000))]);
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
}
afterEach(async()=>{await Promise.all(tempRoots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

test('starts with a deterministic minimal tool surface while preserving the live Godot handshake',async()=>{
  const godotBin=process.env.GODOT_BIN;if(!godotBin)throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');
  const tempRoot=await mkdtemp(path.join(os.tmpdir(),'godot-mcp-profile-integration-'));tempRoots.push(tempRoot);
  await cp(fixtureRoot,tempRoot,{recursive:true});await initProject({projectRoot:tempRoot,godotBin,enable:true});
  const serverEntry=path.resolve('packages/server/dist/index.js');
  const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry,'--project',tempRoot,'--bridge-port','0','--tool-profile','minimal']});
  const client=new Client({name:'profile-integration',version:'0.1.0'});await client.connect(transport);
  const descriptorPath=path.join(tempRoot,'.godot-mcp','runtime','bridge.json');let godot:ChildProcess|null=null;
  try{
    expect((await client.listTools()).tools.map(tool=>tool.name).sort()).toEqual(toolNamesForProfile('minimal'));
    const discovery=await client.callTool({name:'godot.tools',arguments:{}});
    expect(discovery.isError).not.toBe(true);
    expect(discovery.structuredContent).toMatchObject({activeProfile:'minimal',selectedProfile:'minimal',total:5});
    expect(await waitFor(()=>stat(descriptorPath).then(()=>true,()=>false),5000)).toBe(true);
    godot=spawn(godotBin,['--headless','--path',tempRoot,'--editor','res://main.tscn'],{stdio:'inherit',windowsHide:true});
    expect(await waitFor(async()=>((await client.callTool({name:'session.status',arguments:{}})).structuredContent as any)?.editorConnected===true,15000)).toBe(true);
    const capabilities=await client.callTool({name:'godot.capabilities',arguments:{}});
    expect(capabilities.isError).not.toBe(true);
    expect(capabilities.structuredContent).toMatchObject({schemaVersion:1,engine:{major:4,minor:6,patch:3}});
  }finally{await stopProcess(godot);await client.close();}
},30000);
