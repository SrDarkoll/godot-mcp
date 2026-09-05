import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it,vi} from 'vitest';
import {createSession} from '../src/session/session.js';
import {SessionStore} from '../src/session/session-store.js';
import {DiagnosticStore} from '../src/runtime/diagnostic-store.js';
const runId='123e4567-e89b-42d3-a456-426614174000';
it('persists diagnostics once and advances filtered cursors across nonmatching entries',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-log-'));const s=createSession(root);const sessions=new SessionStore(root);await sessions.create(s);
 const store=new DiagnosticStore(sessions,s.id);store.register(runId);
 const entries=[1,2,3].map(sequence=>({sequence,runId,timestamp:s.startedAt,kind:'output' as const,stream:'stdout' as const,message:'hello',file:null,line:null,frames:[],truncated:false}));
 await store.append({runId,entries,dropped:0});await store.append({runId,entries,dropped:0});
 expect(store.query(runId,'error',0,100)).toMatchObject({entries:[],nextCursor:3,oldestAvailable:1,dropped:0,truncated:false});
 expect(store.query(runId,'all',0,2).entries).toHaveLength(2);
 const data=await fs.readFile(path.join(sessions.sessionDir(s.id),'logs/runtime',runId+'.jsonl'),'utf8');expect(data.trim().split('\n')).toHaveLength(3);
 expect(()=>store.query('123e4567-e89b-42d3-a456-426614174001','all',0,10)).toThrow();
});
it('bounds its retained history and reports failed persistence without losing readable output',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-log-bounds-'));const s=createSession(root);const sessions=new SessionStore(root);await sessions.create(s);
 const store=new DiagnosticStore(sessions,s.id);store.register(runId);
 for(let batch=0;batch<41;batch++)await store.append({runId,dropped:2,entries:Array.from({length:50},(_,i)=>({sequence:batch*50+i+1,runId,timestamp:s.startedAt,kind:'output',stream:'stdout',message:'bounded',file:null,line:null,frames:[],truncated:false}))});
 expect(store.query(runId,'all',0,200)).toMatchObject({oldestAvailable:51,dropped:52,truncated:true});
 const realOpen=fs.open;const spy=vi.spyOn(fs,'open').mockImplementation(async(...args)=>{if(String(args[0]).endsWith('.jsonl'))throw new Error('disk full');return realOpen(...args);});
 try{await store.append({runId,dropped:2,entries:[{sequence:2051,runId,timestamp:s.startedAt,kind:'error',stream:null,message:'still readable',file:null,line:null,frames:[],truncated:false}]});}finally{spy.mockRestore();}
 expect(store.degraded(runId)).toBe(true);expect(store.query(runId,'error',2050,10).entries[0]?.message).toBe('still readable');
});
