import WebSocket from 'ws';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {BridgeServer} from '../src/bridge/bridge-server.js';
import {createSession} from '../src/session/session.js';
async function request(port:number,token:string,projectRoot='C:/Games/Test'){
 const ws=new WebSocket(`ws://127.0.0.1:${port}`);
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 const result=new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(new Error('Management response missing'));},1500);ws.once('message',raw=>{clearTimeout(timer);resolve(JSON.parse(raw.toString()));});ws.once('close',()=>{clearTimeout(timer);reject(new Error('Management response missing'));});});
 ws.send(JSON.stringify({type:'management',protocol:1,requestId:randomUUID(),token,projectRoot,command:'status'}));
 const value=await result;ws.close();return value;
}
it('reports authenticated status without displacing an editor and rejects wrong credentials/root',async()=>{
 const session=createSession('C:/Games/Test');const bridge=new BridgeServer({session,token:'a'.repeat(64),port:0});const {port}=await bridge.start();
 const editor=new WebSocket(`ws://127.0.0.1:${port}`);
 await new Promise<void>(resolve=>editor.once('open',resolve));
 editor.send(JSON.stringify({type:'hello',token:'a'.repeat(64),protocol:1,addonVersion:'0.1.0',godotVersion:'4.6.3',projectRoot:session.projectRoot,capabilities:{editor:true,runtime:false,debugger:false,viewport2d:true,viewport3d:true,undoRedo:true}}));
 await bridge.waitUntilConnected();
 try{
  const status=await request(port,'a'.repeat(64));expect(status.ok).toBe(true);expect(status.data.editorConnected).toBe(true);expect(JSON.stringify(status)).not.toContain('a'.repeat(64));expect(bridge.connected).toBe(true);
  expect((await request(port,'b'.repeat(64))).error.code).toBe('AUTH_FAILED');
  expect((await request(port,'a'.repeat(64),'C:/Other')).error.code).toBe('PROJECT_MISMATCH');
 }finally{editor.close();await bridge.stop();}
},10000);
