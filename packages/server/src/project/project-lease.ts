import {createServer,type Server} from 'node:net';
import {realpath,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {BridgeRpcError} from '../bridge/rpc-router.js';

/** Process-lifetime advisory exclusion. No stale PID files are deleted. */
export class ProjectLease {
 private released=false;
 private constructor(private readonly server:Server){}

 static async acquire(root:string):Promise<ProjectLease>{
  if(process.platform!=='win32')throw new BridgeRpcError('UNSUPPORTED_PLATFORM','Project maintenance currently requires Windows');
  const canonical=(await realpath(root)).replaceAll('\\','/').toLowerCase();
  const key=createHash('sha256').update(canonical).digest('hex');
  const server=createServer(socket=>socket.destroy());
  const pipe='\\\\.\\pipe\\godot-mcp-project-'+key;
  try{
   await new Promise<void>((resolve,reject)=>{
    server.once('error',reject);
    server.listen({path:pipe,exclusive:true},()=>{server.removeListener('error',reject);resolve();});
   });
  }catch(error){
   server.close();
   if(['EADDRINUSE','EACCES'].includes((error as NodeJS.ErrnoException).code??'')){
    throw new BridgeRpcError('PROJECT_BUSY','PROJECT_BUSY: stop the owning MCP server or wait for project maintenance to finish');
   }
   throw error;
  }
  // The lease must not keep a failed/closed CLI process alive by itself.
  server.unref();
  return new ProjectLease(server);
 }

 async release():Promise<void>{
  if(this.released)return;
  this.released=true;
  await new Promise<void>((resolve,reject)=>this.server.close(error=>error?reject(error):resolve()));
 }
}

/** Presence is enough to block mutation; corrupt journals must also be retained. */
export async function requireNoRecoveryJournal(root:string):Promise<void>{
 let current=await realpath(root);
 for(const component of ['.godot-mcp','runtime','recovery.json']){
  current=path.join(current,component);
  let entry;
  try{entry=await lstat(current);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
  if(entry.isSymbolicLink()||component==='recovery.json'||!entry.isDirectory()){
   throw new BridgeRpcError('RECOVERY_REQUIRED','Resolve the project recovery journal before addon maintenance');
  }
 }
}

export async function requireNoAddonJournal(root:string):Promise<void>{
 let current=await realpath(root);
 for(const component of ['.godot-mcp','runtime','addon-update.json']){
  current=path.join(current,component);
  let entry;
  try{entry=await lstat(current);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
  if(entry.isSymbolicLink()||component==='addon-update.json'||!entry.isDirectory()){
   throw new BridgeRpcError('ADDON_RECOVERY_REQUIRED','Run addon update to recover the interrupted addon installation before starting MCP');
  }
 }
}
