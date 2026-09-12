import {mkdtemp,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {expect,it} from 'vitest';
import {ProjectLease} from '../src/project/project-lease.js';

it('canonicalizes aliases and permits different projects while rejecting the same project',async()=>{
 const parent=await mkdtemp(path.join(tmpdir(),'godot-lease-'));
 const root=await mkdtemp(path.join(parent,'root-'));
 const other=await mkdtemp(path.join(parent,'other-'));
 await symlink(root,path.join(parent,'alias'),'junction');
 const owner=await ProjectLease.acquire(root);
 const independent=await ProjectLease.acquire(other);
 try{await expect(ProjectLease.acquire(path.join(parent,'alias'))).rejects.toMatchObject({code:'PROJECT_BUSY'});}
 finally{await independent.release();await owner.release();}
 const next=await ProjectLease.acquire(root);await next.release();await next.release();
});

it('releases exclusion after an owning process crashes, without deleting lock files',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'godot-lease-crash-'));
 const module=pathToFileURL(path.resolve(import.meta.dirname,'../dist/project/project-lease.js')).href;
 const source=`import {ProjectLease} from ${JSON.stringify(module)}; await ProjectLease.acquire(process.argv[1]); process.stdin.resume(); process.send('ready');`;
 const child=spawn(process.execPath,['--input-type=module','-e',source,root],{windowsHide:true,stdio:['pipe','pipe','pipe','ipc']});
 try{
  const [ready]=await once(child,'message');expect(ready).toBe('ready');
  await expect(ProjectLease.acquire(root)).rejects.toMatchObject({code:'PROJECT_BUSY'});
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  const next=await ProjectLease.acquire(root);await next.release();
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
},10000);
