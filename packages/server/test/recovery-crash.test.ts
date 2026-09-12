import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';
import {createSession} from '../src/session/session.js';
import {SessionStore} from '../src/session/session-store.js';
import {RecoveryService} from '../src/recovery/recovery-service.js';

it.each(['journal','applying','first_file','committed','rolling_back','rolled_back','recovery_required'])('recovers snapshots after a real process kill at %s',async(stage)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-crash-'));
 const url=(relative:string)=>pathToFileURL(path.resolve(import.meta.dirname,'../dist',relative)).href;
 const source=`import fs from 'node:fs/promises';import path from 'node:path';
 import {createSession} from ${JSON.stringify(url('session/session.js'))};
 import {SessionStore} from ${JSON.stringify(url('session/session-store.js'))};
 import {RecoveryService} from ${JSON.stringify(url('recovery/recovery-service.js'))};
 import {ProjectLease} from ${JSON.stringify(url('project/project-lease.js'))};
 const [root,stage]=process.argv.slice(1);await ProjectLease.acquire(root);process.stdin.resume();
 const session=createSession(root),store=new SessionStore(root);await store.create(session);
 await fs.writeFile(path.join(root,'a.json'),'"before a"');await fs.writeFile(path.join(root,'b.json'),'"before b"');
 const recovery=new RecoveryService(session,store,{connected:false,rpc:{call:async()=>({})}});
 const tx=await recovery.begin({label:'process crash',paths:['res://a.json','res://b.json'],atomic:true});
 await recovery.write(tx.id,'res://a.json','"after a"');
 await recovery.write(tx.id,'res://b.json',stage.startsWith('roll')?'invalid json':'"after b"');
 const pause=async()=>{process.send({sessionId:session.id,id:tx.id});await new Promise(()=>{});};
 const open=fs.open;
 fs.open=async(...args)=>{const h=await open(...args);if(stage==='journal'&&String(args[0]).endsWith('recovery.json')){const sync=h.sync.bind(h);h.sync=async()=>{await sync();await pause();};}return h;};
 const rename=fs.rename;
 fs.rename=async(...args)=>{
  await rename(...args);const destination=String(args[1]);
  if(destination.endsWith('a.json')){
   if(stage==='first_file')await pause();
   if(stage==='recovery_required')await fs.writeFile(path.join(root,'a.json'),'"external"');
  }
  if(destination.endsWith('transaction.json')){const record=JSON.parse(await fs.readFile(destination,'utf8'));if(record.state===stage)await pause();}
 };
 await recovery.commit(tx.id);`;
 const child=spawn(process.execPath,['--input-type=module','-e',source,root,stage],{windowsHide:true,stdio:['pipe','pipe','pipe','ipc']});
 let errors='';child.stderr!.on('data',chunk=>{errors+=chunk;});
 try{
  const [identity]=await once(child,'message',{signal:AbortSignal.timeout(8000)});
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  const session=createSession(root),store=new SessionStore(root);await store.create(session);
  const service=new RecoveryService(session,store,{connected:false,rpc:{call:async()=>({})}});
  expect(await service.barrier(),errors).toEqual(identity);
  const result=await service.recover(identity.sessionId,identity.id,stage==='recovery_required');
  expect(result.state).toBe('rolled_back');
  expect(await fs.readFile(path.join(root,'a.json'),'utf8')).toBe('"before a"');
  expect(await fs.readFile(path.join(root,'b.json'),'utf8')).toBe('"before b"');
  expect(await service.barrier()).toBeNull();
  if(stage==='recovery_required')expect(await service.listCheckpoints()).toHaveLength(1);
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
},12000);
