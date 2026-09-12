import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it} from 'vitest';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {createSession} from '../src/session/session.js';
import {SessionStore} from '../src/session/session-store.js';
import {BridgeServer} from '../src/bridge/bridge-server.js';
import {RecoveryService} from '../src/recovery/recovery-service.js';
import {createMcpServer} from '../src/mcp/create-server.js';

it('previews staged text, binary, creations and deletions without publishing or leaking common secrets',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-diff-'));
 await fs.writeFile(path.join(root,'settings.json'),'name=old\napi_key=PRIVATE_BEFORE\nAWS_SECRET_ACCESS_KEY=HIDDEN_AWS_BEFORE\n');
 await fs.writeFile(path.join(root,'delete.txt'),'remove me\n');
 await fs.writeFile(path.join(root,'image.bin'),Buffer.from([0,255,10]));
 const session=createSession(root),sessions=new SessionStore(root);await sessions.create(session);
 const bridge=new BridgeServer({session,token:'a'.repeat(64),port:0});
 const recovery=new RecoveryService(session,sessions,bridge);
 const tx=await recovery.begin({label:'diff',paths:['res://settings.json','res://delete.txt','res://new.txt','res://image.bin'],atomic:true});
 await recovery.write(tx.id,'res://settings.json','name=new\napi_key=PRIVATE_AFTER\nAWS_SECRET_ACCESS_KEY=HIDDEN_AWS_AFTER\n');
 await recovery.remove(tx.id,'res://delete.txt');await recovery.write(tx.id,'res://new.txt','created\n');await recovery.remove(tx.id,'res://image.bin');
 const server=createMcpServer({session,sessions,bridge,recovery});const client=new Client({name:'diff-test',version:'1'});
 const [ct,st]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(st);await client.connect(ct);
  expect((await client.listTools()).tools.map(t=>t.name)).toContain('transaction.diff');
  const response=await client.callTool({name:'transaction.diff',arguments:{transaction_id:tx.id}});
  expect(response.isError).not.toBe(true);
  const value=response.structuredContent as any;
  expect(JSON.stringify(value)).not.toContain('PRIVATE_BEFORE');expect(JSON.stringify(value)).not.toContain('PRIVATE_AFTER');
  expect(JSON.stringify(value)).not.toContain('HIDDEN_AWS');
  expect(value.files[0].diff).toContain('-name=old');expect(value.files[0].diff).toContain('+name=new');expect(value.files[0].redacted).toBe(true);
  expect(value.files.find((f:any)=>f.path==='res://new.txt')).toMatchObject({action:'create',binary:false});
  expect(value.files.find((f:any)=>f.path==='res://new.txt').diff).toContain('@@ -0,0 +1,1 @@');
  expect(value.files.find((f:any)=>f.path==='res://image.bin')).toMatchObject({action:'delete',binary:true});
  const raw=await client.callTool({name:'transaction.diff',arguments:{transaction_id:tx.id,redact:false}});
  expect(JSON.stringify(raw.structuredContent)).toContain('PRIVATE_AFTER');
  const limited=await client.callTool({name:'transaction.diff',arguments:{transaction_id:tx.id,max_lines:3,max_diff_bytes:256}});
  expect(limited.structuredContent!.truncated).toBe(true);
  const rendered=(limited.structuredContent!.files as any[]).map(f=>f.diff).join('');
  expect(Buffer.byteLength(rendered)).toBeLessThanOrEqual(256);
  expect(rendered.split('\n').length-1).toBeLessThanOrEqual(3);
  expect(await fs.readFile(path.join(root,'settings.json'),'utf8')).toContain('name=old');
  await expect(fs.stat(path.join(root,'new.txt'))).rejects.toMatchObject({code:'ENOENT'});
 }finally{await client.close();await server.close();await recovery.close();}
});
it('reports encoding and line-ending-only changes even when normalized text is equal',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-diff-encoding-'));
 await fs.writeFile(path.join(root,'source.txt'),'\ufeffsame\r\n');
 const session=createSession(root),sessions=new SessionStore(root);await sessions.create(session);
 const recovery=new RecoveryService(session,sessions,{connected:false,rpc:{call:async()=>({})}});
 const tx=await recovery.begin({label:'encoding',paths:['res://source.txt'],atomic:true});await recovery.write(tx.id,'res://source.txt','same\n');
 const result=await recovery.diff(tx.id,{redact:true,context_lines:3,max_lines:200,max_diff_bytes:65536});
 expect(result.files[0]).toMatchObject({action:'modify',beforeText:{lineEnding:'crlf',utf8Bom:true},afterText:{lineEnding:'lf',utf8Bom:false}});
 await recovery.close();
});
