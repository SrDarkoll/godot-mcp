import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {expect,it,vi} from 'vitest';
import {createSession} from '../src/session/session.js';import {SessionStore} from '../src/session/session-store.js';import {RecoveryService} from '../src/recovery/recovery-service.js';import {ToolPolicy} from '../src/security/tool-policy.js';
async function setup(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-policy-'));const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);const recovery=new RecoveryService(session,sessions,{connected:false,rpc:{call:async()=>({})}});return {root,session,sessions,recovery,policy:new ToolPolicy(session,sessions,recovery)};}
it('requires an exact single-use confirmation and rejects stale file fingerprints',async()=>{
 const {root,policy}=await setup();await fs.writeFile(path.join(root,'script.gd'),'original');let ran=0;
 const args={path:'res://script.gd',content:'new'};let token='';
 try{await policy.execute('script.create',args,async()=>{ran++;return {};});}catch(e){expect((e as any).code).toBe('CONFIRMATION_REQUIRED');token=(e as any).details.confirmationToken;}
 expect(ran).toBe(0);await policy.execute('script.create',{...args,confirmation:token},async()=>{ran++;return {};});expect(ran).toBe(1);
 await expect(policy.execute('script.create',{...args,confirmation:token},async()=>({}))).rejects.toMatchObject({code:'CONFIRMATION_REQUIRED'});
 try{await policy.execute('script.create',args,async()=>({}));}catch(e){token=(e as any).details.confirmationToken;}
 await fs.writeFile(path.join(root,'script.gd'),'external edit');await expect(policy.execute('script.create',{...args,confirmation:token},async()=>({}))).rejects.toMatchObject({code:'CONFIRMATION_REQUIRED'});
});
it('enforces disabled permissions and resets permissions for a new service instance',async()=>{
 const {session,sessions,recovery,policy}=await setup();await policy.setPermission('editor.modify',false);
 await expect(policy.execute('node.create',{},async()=>({}))).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 const state=vi.spyOn(recovery,'editorState').mockRejectedValue(new Error('Denied calls must not inspect the editor'));
 try{await expect(policy.execute('editor.close_scene',{},async()=>({}))).rejects.toMatchObject({code:'PERMISSION_DENIED'});}finally{state.mockRestore();}
 expect(new ToolPolicy(session,sessions,recovery).permissions()['editor.modify']).toBe(true);
});
it('blocks unrelated mutations while a file transaction is open',async()=>{
 const {recovery,policy}=await setup();await recovery.begin({label:'one',paths:['res://new.json'],atomic:true});
 await expect(policy.execute('node.create',{},async()=>({}))).rejects.toMatchObject({code:'TRANSACTION_ACTIVE'});
 expect(await policy.execute('session.status',{},async()=>({ok:true}))).toEqual({ok:true});
});
it('requires confirmation for the enable alias and waits for an executing writer at shutdown',async()=>{
 const {policy}=await setup();await expect(policy.execute('permissions.enable',{permission:'filesystem.external'},async()=>({}))).rejects.toMatchObject({code:'CONFIRMATION_REQUIRED'});
 let release!:()=>void;let started!:()=>void;const waiting=new Promise<void>(r=>{release=r;});const began=new Promise<void>(r=>{started=r;});
 const writer=policy.execute('node.create',{},async()=>{started();await waiting;return {};});await began;
 expect(await policy.execute('runtime.status',{},async()=>({state:'running'}))).toEqual({state:'running'});
 let read=false;const reader=policy.execute('project.info',{},async()=>{read=true;return {};});const denied=expect(reader).rejects.toMatchObject({code:'SESSION_CLOSED'});
 let closed=false;const closing=policy.close().then(()=>{closed=true;});await new Promise(r=>setTimeout(r,10));expect(read).toBe(false);expect(closed).toBe(false);
 release();await writer;await closing;await denied;
 await expect(policy.execute('node.create',{},async()=>({}))).rejects.toMatchObject({code:'SESSION_CLOSED'});
});
