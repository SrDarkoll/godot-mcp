import fs from 'node:fs/promises';
import path from 'node:path';
import {SessionManifestSchema,type SessionManifest} from '@godot-mcp/protocol';
export {SessionStore} from './session-store.js';
const ID=/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z_[a-f0-9]{8}$/;
async function directory(root:string,sessionId?:string):Promise<string>{
 if(sessionId!==undefined&&!ID.test(sessionId))throw new Error('Invalid session id');
 let current=await fs.realpath(root);
 for(const part of ['.godot-mcp','sessions',...(sessionId?[sessionId]:[])]){current=path.join(current,part);const stat=await fs.lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Invalid session directory');}
 return current;
}
export async function readSessionManifest(root:string,id:string):Promise<SessionManifest>{
 try{
  const file=path.join(await directory(root,id),'manifest.json');const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size>8*1024*1024)throw new Error('Invalid manifest');
  const manifest=SessionManifestSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));
  const canonical=(value:string)=>path.resolve(value).replaceAll('\\','/').toLowerCase();
  if(manifest.sessionId!==id||canonical(manifest.projectRoot)!==canonical(root))throw new Error('Session project mismatch');
  return manifest;
 }catch{throw new Error('Invalid or unavailable session manifest');}
}
export async function listSessions(root:string,limit=20,before?:string){
 if(!Number.isInteger(limit)||limit<1||limit>200||(before!==undefined&&!ID.test(before)))throw new Error('Invalid session page');
 let dir:string;try{dir=await directory(root);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {sessions:[],nextCursor:null};throw error;}
 const ids=(await fs.readdir(dir)).filter(id=>ID.test(id)&&(!before||id<before)).sort().reverse();
 const rows=[];
 for(const id of ids.slice(0,limit)){
  try{const m=await readSessionManifest(root,id);rows.push({sessionId:id,startedAt:m.startedAt,endedAt:m.endedAt,screenshots:m.screenshots.length,transactions:m.transactions.length,checkpoints:m.checkpoints.length});}
  catch{rows.push({sessionId:id,error:'Invalid or unavailable manifest'});}
 }
 return {sessions:rows,nextCursor:ids.length>limit?ids[limit-1]!:null};
}
