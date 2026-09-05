import fs from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import {randomUUID} from 'node:crypto';
import {BridgeDescriptorSchema,ManagementResponseSchema,ManagementStatusSchema,type BridgeDescriptor,type ManagementStatus} from '@godot-mcp/protocol';
import {BridgeRpcError} from '../bridge/rpc-router.js';

export async function readDescriptor(root:string):Promise<BridgeDescriptor|null>{
 try{
  for(const relative of ['.godot-mcp','.godot-mcp/runtime']){const st=await fs.lstat(path.join(root,relative));if(st.isSymbolicLink()||!st.isDirectory())throw new Error('Invalid runtime directory');}
  const file=path.join(root,'.godot-mcp/runtime/bridge.json');const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink>1||st.size>8192)throw new Error('Invalid bridge descriptor');
  return BridgeDescriptorSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw new BridgeRpcError('INVALID_DESCRIPTOR','Invalid or inaccessible bridge descriptor');}
}

async function request(root:string,descriptor:BridgeDescriptor,command:'status'|'shutdown'):Promise<Record<string,unknown>>{
 const requestId=randomUUID();
 return await new Promise((resolve,reject)=>{
  const socket=new WebSocket(`ws://127.0.0.1:${descriptor.port}`,{maxPayload:64*1024,handshakeTimeout:3000});
  let done=false;
  const finish=(error:Error|null,data:Record<string,unknown>={})=>{if(done)return;done=true;clearTimeout(timer);socket.close();error?reject(error):resolve(data);};
  const timer=setTimeout(()=>finish(new BridgeRpcError('SERVER_UNAVAILABLE','Management response timed out')),4000);
  socket.once('open',()=>socket.send(JSON.stringify({type:'management',protocol:1,requestId,token:descriptor.token,projectRoot:root,command})));
  socket.once('error',()=>finish(new BridgeRpcError('SERVER_UNAVAILABLE','Unable to reach the project server')));
  socket.once('close',()=>finish(new BridgeRpcError('SERVER_UNAVAILABLE','Server closed without a management response')));
  socket.once('message',raw=>{
   try{
    const response=ManagementResponseSchema.parse(JSON.parse(raw.toString()));
    if(response.requestId!==requestId||response.sessionId!==descriptor.sessionId)throw new Error('Wrong identity');
    if(!response.ok){finish(new BridgeRpcError(response.error.code,response.error.message));return;}
    finish(null,response.data);
   }catch{finish(new BridgeRpcError('INVALID_MANAGEMENT_RESPONSE','Management response did not match the request'));}
  });
 });
}

export async function serverStatus(root:string):Promise<ManagementStatus|{state:'offline';projectRoot:string;editorConnected:false;runtimeConnected:false}>{
 const descriptor=await readDescriptor(root);
 if(!descriptor)return {state:'offline',projectRoot:root,editorConnected:false,runtimeConnected:false};
 try{return ManagementStatusSchema.parse(await request(root,descriptor,'status'));}
 catch(error){if(error instanceof BridgeRpcError)throw error;throw new BridgeRpcError('INVALID_MANAGEMENT_RESPONSE','Invalid server status');}
}

export async function stopServer(root:string):Promise<{stopped:boolean;sessionId:string|null}>{
 const descriptor=await readDescriptor(root);if(!descriptor)return {stopped:false,sessionId:null};
 const response=await request(root,descriptor,'shutdown');
 if(response.accepted!==true)throw new BridgeRpcError('INVALID_MANAGEMENT_RESPONSE','Shutdown was not accepted');
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){
  const current=await readDescriptor(root);
  if(!current)return {stopped:true,sessionId:descriptor.sessionId};
  if(current.sessionId!==descriptor.sessionId){
   try{await request(root,descriptor,'status');}catch(error){if(error instanceof BridgeRpcError&&error.code==='SERVER_UNAVAILABLE')return {stopped:true,sessionId:descriptor.sessionId};throw error;}
  }
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new BridgeRpcError('STOP_TIMEOUT','Shutdown was accepted but has not finished; inspect status before retrying');
}
