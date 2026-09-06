import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { HeadlessProcessManager } from '../src/headless/headless-process-manager.js';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';

class FakeChild extends EventEmitter {
  readonly stdout=new PassThrough();readonly stderr=new PassThrough();pid=4321;kills:string[]=[];
  kill(signal?:NodeJS.Signals|number){this.kills.push(String(signal ?? 'SIGTERM'));return true;}
  spawn(){this.emit('spawn');}
  close(code:number|null=0,signal:NodeJS.Signals|null=null){this.stdout.end();this.stderr.end();this.emit('close',code,signal);}
}

async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-headless-manager-'));
  await fs.writeFile(path.join(root,'project.godot'),'config_version=5\n');
  await fs.mkdir(path.join(root,'levels'));await fs.writeFile(path.join(root,'levels','test.tscn'),'[gd_scene format=3]\n');
  await fs.mkdir(path.join(root,'tests'));await fs.writeFile(path.join(root,'tests','test.gd'),'extends SceneTree\n');
  const bin=path.join(root,process.platform==='win32'?'godot.exe':'godot');await fs.writeFile(bin,'fake');if(process.platform!=='win32')await fs.chmod(bin,0o755);
  const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);
  return {root,bin,session,sessions};
}

describe('HeadlessProcessManager',()=>{
  it('constructs only fixed Godot argv and marks owned children',async()=>{
    const f=await fixture();const calls:Array<{bin:string;args:string[];options:any;child:FakeChild}>=[];
    const spawnImpl=((bin:string,args:string[],options:any)=>{const child=new FakeChild();calls.push({bin,args,options,child});queueMicrotask(()=>child.spawn());return child as any;}) as any;
    const manager=new HeadlessProcessManager(f.session,f.sessions,{godotBin:f.bin,spawnImpl});
    const run=await manager.run();
    expect(run.state).toBe('running');
    expect(calls[0]!.args).toEqual(['--headless','--path',f.root]);
    expect(calls[0]!.options).toMatchObject({shell:false,cwd:f.root});
    expect(calls[0]!.options.env.GODOT_MCP_HEADLESS_CHILD).toBe('1');
    calls[0]!.child.close(0);await new Promise(resolve=>setImmediate(resolve));

    const scene=await manager.runScene({scene_path:'res://levels/test.tscn'});
    expect(scene.scenePath).toBe('res://levels/test.tscn');
    expect(calls[1]!.args).toEqual(['--headless','--path',f.root,'res://levels/test.tscn']);
    calls[1]!.child.close(0);await new Promise(resolve=>setImmediate(resolve));

    const testPromise=manager.runTests({script_path:'res://tests/test.gd',timeout_ms:1000});
    await new Promise(resolve=>setImmediate(resolve));
    expect(calls[2]!.args).toEqual(['--headless','--path',f.root,'--script','res://tests/test.gd']);
    calls[2]!.child.close(7);
    expect((await testPromise).exitCode).toBe(7);
  });


  it('uses exact fixed argv for bounded validate and import jobs',async()=>{
    const f=await fixture();const calls:Array<{args:string[];child:FakeChild}>=[];
    const spawnImpl=((_bin:string,args:string[])=>{const child=new FakeChild();calls.push({args,child});queueMicrotask(()=>child.spawn());return child as any;}) as any;
    const manager=new HeadlessProcessManager(f.session,f.sessions,{godotBin:f.bin,spawnImpl});

    const validating=manager.validateProject({timeout_ms:1000});
    await new Promise(resolve=>setImmediate(resolve));
    expect(calls[0]!.args).toEqual(['--headless','--path',f.root,'--editor','--quit']);
    calls[0]!.child.close(0);
    expect((await validating).exitCode).toBe(0);

    const importing=manager.importProject({timeout_ms:1000});
    await new Promise(resolve=>setImmediate(resolve));
    expect(calls[1]!.args).toEqual(['--headless','--path',f.root,'--import']);
    calls[1]!.child.close(0);
    expect((await importing).exitCode).toBe(0);
  });

  it('retains ownership when a spawned child emits an error until the child is actually stopped',async()=>{
    const f=await fixture();let child:FakeChild|undefined;
    const spawnImpl=((_bin:string,_args:string[],_options:any)=>{child=new FakeChild();queueMicrotask(()=>child!.spawn());return child as any;}) as any;
    const manager=new HeadlessProcessManager(f.session,f.sessions,{godotBin:f.bin,spawnImpl});
    const run=await manager.run();

    child!.emit('error',new Error('post-spawn child error'));
    await new Promise(resolve=>setImmediate(resolve));
    expect((await manager.status()).active?.executionId).toBe(run.executionId);
    await expect(manager.run()).rejects.toMatchObject({code:'HEADLESS_BUSY'});

    const stopped=manager.stop();
    queueMicrotask(()=>child!.close(null,'SIGTERM'));
    expect(await stopped).toMatchObject({stopped:true,execution:{state:'failed',errorCode:'HEADLESS_PROCESS_ERROR'}});
    expect((await manager.status()).active).toBeNull();
  });

  it('enforces one active child and stops only the owned child',async()=>{
    const f=await fixture();let child:FakeChild|undefined;
    const spawnImpl=((_bin:string,_args:string[],_options:any)=>{child=new FakeChild();queueMicrotask(()=>child!.spawn());return child as any;}) as any;
    const manager=new HeadlessProcessManager(f.session,f.sessions,{godotBin:f.bin,spawnImpl});
    await manager.run();
    await expect(manager.run()).rejects.toMatchObject({code:'HEADLESS_BUSY'});
    const stop=manager.stop();queueMicrotask(()=>child!.close(null,'SIGTERM'));
    expect((await stop).stopped).toBe(true);
    expect(child!.kills).toEqual(['SIGTERM']);
    expect((await manager.status()).active).toBeNull();
  });

  it('returns structured unavailable/spawn failures and finalizes bounded timeout',async()=>{
    const f=await fixture();
    const missing=new HeadlessProcessManager(f.session,f.sessions,{godotBin:path.join(f.root,'missing')});
    await expect(missing.run()).rejects.toMatchObject({code:'HEADLESS_GODOT_UNAVAILABLE'});

    const spawnError=((_bin:string,_args:string[],_options:any)=>{const child=new FakeChild();queueMicrotask(()=>child.emit('error',new Error('boom')));return child as any;}) as any;
    const failed=new HeadlessProcessManager(f.session,f.sessions,{godotBin:f.bin,spawnImpl:spawnError});
    await expect(failed.run()).rejects.toMatchObject({code:'HEADLESS_SPAWN_FAILED'});

    let child:FakeChild|undefined;
    const hanging=((_bin:string,_args:string[],_options:any)=>{child=new FakeChild();queueMicrotask(()=>child!.spawn());return child as any;}) as any;
    const timed=new HeadlessProcessManager(f.session,f.sessions,{godotBin:f.bin,spawnImpl:hanging});
    const promise=timed.validateProject({timeout_ms:5});
    setTimeout(()=>child?.close(null,'SIGTERM'),7);
    const record=await promise;
    expect(record).toMatchObject({state:'failed',timedOut:true,errorCode:'HEADLESS_TIMEOUT'});
    expect(child!.kills.length).toBeGreaterThan(0);
  });
});
