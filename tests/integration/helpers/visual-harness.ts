import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {cp,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {initProject} from '../../../packages/cli/src/init/init-project.js';

export async function waitFor(check:()=>Promise<boolean>,timeout=15000):Promise<void> {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,50));}
  throw new Error('Editor readiness deadline exceeded');
}
export async function stopProcess(child:ChildProcess):Promise<void> {
  if(child.exitCode!==null || child.signalCode!==null)return;
  const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
  child.kill();
  let timer:ReturnType<typeof setTimeout>;
  await Promise.race([exited,new Promise<void>(resolve=>{timer=setTimeout(resolve,3000);})]);
  clearTimeout(timer!);
  if(child.exitCode===null && child.signalCode===null){child.kill('SIGKILL');await exited;}
}
export async function startClient(root:string) {
  const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/server/dist/index.js'),'--project',root,'--bridge-port','0']});
  const client=new Client({name:'visual-integration',version:'1'});
  await client.connect(transport);
  return client;
}
export async function visualHarness(godotBin:string,openScene=true) {
  const parent=path.resolve('.godot-mcp/visual-test-runs');
  await mkdir(parent,{recursive:true});
  const root=await mkdtemp(path.join(parent,'graphical-'));
  await cp(path.resolve('fixtures/visual-project'),root,{recursive:true});
  const generated=spawnSync(godotBin,['--headless','--path',root,'--script',path.resolve('tests/integration/helpers/generate_noise.gd')],{encoding:'utf8',windowsHide:true,timeout:15000});
  if(generated.status!==0)throw new Error(`Noise fixture failed: ${generated.stderr}`);
  await initProject({projectRoot:root,godotBin,enable:true});
  const client=await startClient(root);
  const child=spawn(godotBin,['--editor','--path',root,'--rendering-method','gl_compatibility',...(openScene?['res://main_2d.tscn']:[])],{windowsHide:true});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  return {root,client,logs:()=>logs,stopEditor:()=>stopProcess(child),
    close:async()=>{await client.close();await stopProcess(child);await writeFile(path.join(root,'test-output.log'),logs);}};
}
