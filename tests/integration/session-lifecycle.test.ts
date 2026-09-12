import {spawn} from 'node:child_process';
import {mkdtemp,cp,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it} from 'vitest';

it('publishes endedAt on graceful stdin EOF without deleting the session',async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),'godot-mcp-lifecycle-'));
  await cp(path.resolve('fixtures/empty-project'),root,{recursive:true});
  const child = spawn(process.execPath,['packages/server/dist/index.js','--project',root,'--bridge-port','0'],{windowsHide:true});
  let errors='';child.stderr.on('data',d=>errors+=d);child.stdout.resume();
  try {
    const deadline=Date.now()+5000;
    while (Date.now()<deadline) {
      try {await readFile(path.join(root,'.godot-mcp/runtime/bridge.json'));break;} catch {await new Promise(r=>setTimeout(r,25));}
    }
    child.stdin.end();
    const exited = await new Promise<number|null>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Shutdown timeout')),5000);
      child.once('exit',code=>{clearTimeout(timer);resolve(code);});
    });
    expect(exited,errors).toBe(0);
    const dirs=await readdir(path.join(root,'.godot-mcp/sessions'));
    const manifest=JSON.parse(await readFile(path.join(root,'.godot-mcp/sessions',dirs[0]!,'manifest.json'),'utf8'));
    expect(manifest.endedAt).toEqual(expect.any(String));
    expect(manifest.screenshots).toEqual([]);
  } finally {if(child.exitCode===null)child.kill();}
},15000);
