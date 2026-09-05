import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ensureProjectDirectory} from '@godot-mcp/server/project-config';

async function walk(root:string,relative=''):Promise<string[]>{
 const files:string[]=[];
 for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
  const value=path.join(relative,entry.name);
  if(entry.isSymbolicLink())throw new Error('Addon template cannot contain links');
  if(entry.isDirectory())files.push(...await walk(root,value));else if(entry.isFile())files.push(value);
 }
 return files;
}
export async function installAddon(root:string,template:string):Promise<string|undefined>{
 const target=await ensureProjectDirectory(root,['addons','godot_mcp']);
 const entries:Array<{relative:string;destination:string;before:Buffer|null;after:Buffer}>=[];
 for(const relative of await walk(template)){
  const destination=path.join(target,relative);
  await ensureProjectDirectory(root,['addons','godot_mcp',...relative.split(path.sep).slice(0,-1)]);
  let before:Buffer|null=null;
  try{const stat=await fs.lstat(destination);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size>16*1024*1024)throw new Error('Unsafe addon destination');before=await fs.readFile(destination);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const after=await fs.readFile(path.join(template,relative));
  if(before===null||!before.equals(after))entries.push({relative,destination,before,after});
 }
 let backupPath:string|undefined;
 if(entries.some(e=>e.before!==null)){
  const id=new Date().toISOString().replace(/[:.]/g,'-')+'_'+randomUUID().slice(0,8);
  backupPath=await ensureProjectDirectory(root,['.godot-mcp','addon-backups',id]);
  for(const entry of entries){if(entry.before===null)continue;const dir=await ensureProjectDirectory(root,['.godot-mcp','addon-backups',id,'files',...entry.relative.split(path.sep).slice(0,-1)]);await fs.writeFile(path.join(dir,path.basename(entry.relative)),entry.before,{flag:'wx'});}
  await fs.writeFile(path.join(backupPath,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),files:entries.filter(e=>e.before!==null).map(e=>e.relative.replaceAll('\\','/'))},null,2),{flag:'wx'});
 }
 for(const entry of entries){
  const current=await fs.readFile(entry.destination).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(current===null?entry.before!==null:entry.before===null||!current.equals(entry.before))throw new Error('Addon file changed during installation; backup retained');
  const temporary=entry.destination+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temporary,entry.after,{flag:'wx'});await fs.rename(temporary,entry.destination);}finally{await fs.unlink(temporary).catch(()=>{});}
 }
 return backupPath;
}
