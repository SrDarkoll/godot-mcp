import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {expect,it,vi} from 'vitest';
import {createSession} from '../src/session/session.js';import {SessionStore} from '../src/session/session-store.js';
import {RecoveryService} from '../src/recovery/recovery-service.js';
async function setup(valid=true){const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-recovery-'));const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);
 await fs.writeFile(path.join(root,'main.tscn'),'before scene\r\n');await fs.writeFile(path.join(root,'main.gd'),'extends Node\r\n');
 const bridge={connected:true,rpc:{call:async(method:string)=>method==='recovery.validate'?{valid,errors:valid?[]:['Invalid GDScript']}:{ready:true}}};
 return {root,session,sessions,bridge,service:new RecoveryService(session,sessions,bridge)};}
it.each(['write','delete'] as const)('preserves an external edit after publication preflight during %s',async(action)=>{
 const {root,service}=await setup();
 const tx=await service.begin({label:'concurrent writer',paths:['res://main.gd'],atomic:true});
 if(action==='write')await service.write(tx.id,'res://main.gd','extends Node\n# agent');else await service.remove(tx.id,'res://main.gd');
 const original=service.files.write.bind(service.files);let injected=false;
 const spy=vi.spyOn(service.files,'write').mockImplementation(async(...args)=>{
  if(!injected){injected=true;await fs.writeFile(path.join(root,'main.gd'),'human edit after preflight');}
  return original(...args);
 });
 try{await expect(service.commit(tx.id)).rejects.toMatchObject({code:'RECOVERY_REQUIRED'});}finally{spy.mockRestore();}
 expect(await fs.readFile(path.join(root,'main.gd'),'utf8')).toBe('human edit after preflight');
 expect(await service.barrier()).toMatchObject({id:tx.id});
});
it('preserves external edits introduced immediately before compensation writes',async()=>{
 const {root,service}=await setup(false);
 const tx=await service.begin({label:'rollback conflict',paths:['res://main.gd'],atomic:true});
 await service.write(tx.id,'res://main.gd','agent invalid');
 const original=service.files.write.bind(service.files);let writes=0;
 const spy=vi.spyOn(service.files,'write').mockImplementation(async(...args)=>{
  if(++writes===2)await fs.writeFile(path.join(root,'main.gd'),'human edit during rollback');
  return original(...args);
 });
 try{await expect(service.commit(tx.id)).rejects.toMatchObject({code:'RECOVERY_REQUIRED'});}finally{spy.mockRestore();}
 expect(await fs.readFile(path.join(root,'main.gd'),'utf8')).toBe('human edit during rollback');
});
it('does not force-recover over edits that were not captured in its safety checkpoint',async()=>{
 const {root,session,service}=await setup();
 const tx=await service.begin({label:'force conflict',paths:['res://main.gd'],atomic:true});
 await service.write(tx.id,'res://main.gd','agent change');
 const record=await service.snapshots.load(session.id,tx.id);record.state='applying';await service.snapshots.save(record);
 await fs.mkdir(path.join(root,'.godot-mcp/runtime'),{recursive:true});
 await fs.writeFile(path.join(root,'.godot-mcp/runtime/recovery.json'),JSON.stringify({sessionId:session.id,id:tx.id}));
 await fs.writeFile(path.join(root,'main.gd'),'first human edit');
 const original=service.snapshots.create.bind(service.snapshots);
 const spy=vi.spyOn(service.snapshots,'create').mockImplementation(async(...args)=>{
  const checkpoint=await original(...args);await fs.writeFile(path.join(root,'main.gd'),'later human edit');return checkpoint;
 });
 try{await expect(service.recover(session.id,tx.id,true)).rejects.toMatchObject({code:'RECOVERY_CONFLICT'});}finally{spy.mockRestore();}
 expect(await fs.readFile(path.join(root,'main.gd'),'utf8')).toBe('later human edit');
 expect(await service.barrier()).toMatchObject({id:tx.id});
});
it('stages without touching files and compensates an invalid published scene/script batch exactly',async()=>{
 const {root,service}=await setup(false);const scene=await fs.readFile(path.join(root,'main.tscn'));const script=await fs.readFile(path.join(root,'main.gd'));
 const tx=await service.begin({label:'two files',paths:['res://main.tscn','res://main.gd'],atomic:true});
 await service.write(tx.id,'res://main.tscn','after scene');await service.write(tx.id,'res://main.gd','invalid(');
 expect(await fs.readFile(path.join(root,'main.gd'))).toEqual(script);
 const preview=await service.preview(tx.id);expect(preview.changes).toHaveLength(2);
 const result=await service.commit(tx.id);expect(result.state).toBe('rolled_back');expect(result.validation?.valid).toBe(false);
 expect(await fs.readFile(path.join(root,'main.tscn'))).toEqual(scene);expect(await fs.readFile(path.join(root,'main.gd'))).toEqual(script);
});
it('rejects outside edits and path links before publishing any file',async()=>{
 const {root,service}=await setup();const tx=await service.begin({label:'conflict',paths:['res://main.tscn','res://main.gd'],atomic:true});
 await service.write(tx.id,'res://main.tscn','new scene');await service.write(tx.id,'res://main.gd','new script');
 await fs.writeFile(path.join(root,'main.gd'),'human edit');await expect(service.commit(tx.id)).rejects.toMatchObject({code:'RECOVERY_CONFLICT'});
 expect(await fs.readFile(path.join(root,'main.tscn'),'utf8')).toBe('before scene\r\n');
 await service.rollback(tx.id);
 const outside=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-outside-'));await fs.writeFile(path.join(outside,'secret.gd'),'outside');await fs.symlink(outside,path.join(root,'link'),'junction');
 await expect(service.begin({label:'unsafe',paths:['res://link/secret.gd'],atomic:true})).rejects.toMatchObject({code:'PATH_OUTSIDE_PROJECT'});
});
it('restores checkpoints including missing and binary files without deleting unrelated files',async()=>{
 const {root,session,service}=await setup();await fs.writeFile(path.join(root,'bytes.bin'),Buffer.from([0,255,128]));
 const cp=await service.createCheckpoint('files',['res://bytes.bin','res://new.json']);
 await fs.writeFile(path.join(root,'bytes.bin'),Buffer.from([4]));await fs.writeFile(path.join(root,'new.json'),'{}');await fs.writeFile(path.join(root,'other.txt'),'keep');
 const restored=await service.restoreCheckpoint(cp.id,session.id);expect(restored.state).toBe('committed');
 expect(await fs.readFile(path.join(root,'bytes.bin'))).toEqual(Buffer.from([0,255,128]));await expect(fs.stat(path.join(root,'new.json'))).rejects.toThrow();
 expect(await fs.readFile(path.join(root,'other.txt'),'utf8')).toBe('keep');expect((await service.listCheckpoints(session.id)).length).toBe(1);
});
it('retains a crash journal across service restart and refuses recovery over a human edit',async()=>{
 const {root,session,sessions,service,bridge}=await setup();const tx=await service.begin({label:'crash',paths:['res://main.tscn','res://main.gd'],atomic:true});
 await service.write(tx.id,'res://main.tscn','after scene');await service.write(tx.id,'res://main.gd','after script');
 const stored=await service.snapshots.load(session.id,tx.id);stored.state='applying';await service.snapshots.save(stored);
 await fs.mkdir(path.join(root,'.godot-mcp/runtime'),{recursive:true});await fs.writeFile(path.join(root,'.godot-mcp/runtime/recovery.json'),JSON.stringify({sessionId:session.id,id:tx.id}));
 await fs.writeFile(path.join(root,'main.tscn'),'after scene');await fs.writeFile(path.join(root,'main.gd'),'human edit');
 const next=createSession(root);await sessions.create(next);const resumed=new RecoveryService(next,sessions,bridge);
 await expect(resumed.begin({label:'blocked',paths:['res://x.json'],atomic:true})).rejects.toMatchObject({code:'RECOVERY_REQUIRED'});
 await expect(resumed.recover(session.id,tx.id)).rejects.toMatchObject({code:'RECOVERY_CONFLICT'});
 expect(await fs.readFile(path.join(root,'main.gd'),'utf8')).toBe('human edit');
 const result=await resumed.recover(session.id,tx.id,true);expect(result.state).toBe('rolled_back');
 expect(await fs.readFile(path.join(root,'main.gd'),'utf8')).toBe('extends Node\r\n');
 const backups=await resumed.listCheckpoints(next.id);expect(backups).toHaveLength(1);const old=backups[0]!.before.find(e=>e.path==='res://main.gd')!;
 expect((await resumed.snapshots.bytes(backups[0]!,'before',old))!.toString()).toBe('human edit');expect(await resumed.barrier()).toBeNull();
});
it('compensates a second-file write failure and keeps all snapshot evidence',async()=>{
 const {root,service}=await setup();const tx=await service.begin({label:'disk failure',paths:['res://main.tscn','res://main.gd'],atomic:true});
 await service.write(tx.id,'res://main.tscn','after scene');await service.write(tx.id,'res://main.gd','after script');
 const real=fs.rename;const mocked=vi.spyOn(fs,'rename').mockImplementation(async(...args)=>{if(String(args[1])===path.join(root,'main.gd'))throw new Error('disk failure');return real(...args);});
 try{expect((await service.commit(tx.id)).state).toBe('rolled_back');}finally{mocked.mockRestore();}
 expect(await fs.readFile(path.join(root,'main.tscn'),'utf8')).toBe('before scene\r\n');expect(await service.barrier()).toBeNull();
});
