import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ensureProjectDirectory} from '@godot-mcp/server/project-config';
import {ordinaryBytes} from '../init/addon-journal.js';

export interface UpgradeChange {relative:string;before:Buffer|null;after:Buffer;}
interface Entry {relative:string;beforeHash:string|null;afterHash:string;}
interface RecordData {version:1;id:string;root:string;state:'prepared'|'applying'|'verifying'|'committed'|'rolled_back';entries:Entry[];}
const hash=(bytes:Buffer|null)=>bytes===null?null:createHash('sha256').update(bytes).digest('hex');
const failure=(message:string)=>Object.assign(new Error(message),{code:'UPGRADE_RECOVERY_REQUIRED'});
const fixed=new Set(['project.godot','.gitignore','.codex/config.toml','.godot-mcp/config.json','.godot-mcp/generated/runtime_logger.gd']);

function validate(relative:string):string[]{
 const parts=relative.split('/');
 if(relative.length>1024||parts.some(p=>!p||p==='.'||p==='..'||/[\\:\0]/.test(p))||
   (!fixed.has(relative)&&!relative.startsWith('addons/godot_mcp/')))throw failure('Invalid upgrade-owned path');
 return parts;
}
async function fileAt(root:string,relative:string):Promise<string>{const parts=validate(relative),name=parts.pop()!;return path.join(await ensureProjectDirectory(root,parts),name);}
async function atomic(file:string,bytes:Buffer):Promise<void>{
 const temporary=file+'.'+randomUUID()+'.tmp';const handle=await fs.open(temporary,'wx',0o600);
 try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 try{await fs.rename(temporary,file);}finally{await fs.unlink(temporary).catch(()=>{});}
}
async function exclusive(file:string,bytes:Buffer):Promise<void>{const handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}

export class UpgradeJournal {
 private constructor(private readonly root:string,readonly backupPath:string,private readonly record:RecordData){}
 private async marker(){return path.join(await ensureProjectDirectory(this.root,['.godot-mcp','runtime']),'recovery.json');}
 private async save(){await atomic(path.join(this.backupPath,'manifest.json'),Buffer.from(JSON.stringify(this.record,null,2)));}
 private async clear(){
  const marker=await this.marker(),bytes=await ordinaryBytes(marker,4096);
  if(bytes){const data=JSON.parse(bytes.toString());if(data.kind!=='godot-mcp-upgrade'||data.id!==this.record.id)throw failure('Upgrade recovery ownership changed');await fs.unlink(marker);}
 }
 private async blob(prefix:'before'|'after',relative:string){
  const parts=validate(relative),name=parts.pop()!;
  const directory=await ensureProjectDirectory(this.root,['.godot-mcp','upgrade-backups',this.record.id,prefix,...parts]);
  return path.join(directory,name);
 }
 static async stagingDirectory(root:string):Promise<string>{
  const directory=await ensureProjectDirectory(root,['.godot-mcp','upgrade-backups']);
  const ignore=path.join(directory,'.gitignore'),before=await ordinaryBytes(ignore,65536);
  if(before===null)await exclusive(ignore,Buffer.from('*\n'));
  else if(!before.toString().split(/\r?\n/).includes('*'))await atomic(ignore,Buffer.concat([before,Buffer.from('\n*\n')]));
  return ensureProjectDirectory(root,['.godot-mcp','upgrade-backups','stage-'+randomUUID()]);
 }
 static async prepare(root:string,changes:UpgradeChange[]):Promise<UpgradeJournal>{
  if(changes.length>1024||changes.reduce((n,c)=>n+(c.before?.length??0)+c.after.length,0)>128*1024*1024)throw failure('Upgrade exceeds backup limits');
  const names=new Set<string>();for(const change of changes){validate(change.relative);const key=change.relative.toLowerCase();if(names.has(key))throw failure('Duplicate upgrade path');names.add(key);}
  const runtime=await ensureProjectDirectory(root,['.godot-mcp','runtime']);
  if(await ordinaryBytes(path.join(runtime,'recovery.json'),4096))throw Object.assign(new Error('Another recovery journal requires attention'),{code:'RECOVERY_REQUIRED'});
  const id=randomUUID(),backupPath=await ensureProjectDirectory(root,['.godot-mcp','upgrade-backups',id]);
  const ignore=path.join(await ensureProjectDirectory(root,['.godot-mcp','upgrade-backups']),'.gitignore');
  if(await ordinaryBytes(ignore)===null)await exclusive(ignore,Buffer.from('*\n'));
  const record:RecordData={version:1,id,root:await fs.realpath(root),state:'prepared',entries:[]};
  const journal=new UpgradeJournal(root,backupPath,record);
  for(const change of changes){
   const current=await ordinaryBytes(await fileAt(root,change.relative));if(hash(current)!==hash(change.before))throw failure('Installation changed during upgrade preview');
   if(change.before!==null)await exclusive(await journal.blob('before',change.relative),change.before);
   await exclusive(await journal.blob('after',change.relative),change.after);
   record.entries.push({relative:change.relative,beforeHash:hash(change.before),afterHash:hash(change.after)!});
  }
  await journal.save();await exclusive(await journal.marker(),Buffer.from(JSON.stringify({kind:'godot-mcp-upgrade',version:1,id})));
  return journal;
 }
 static async recoverPending(root:string):Promise<boolean>{
  const runtime=await ensureProjectDirectory(root,['.godot-mcp','runtime']),bytes=await ordinaryBytes(path.join(runtime,'recovery.json'),4096);
  if(!bytes)return false;
  let marker:any;try{marker=JSON.parse(bytes.toString());}catch{throw Object.assign(new Error('Unrecognized recovery journal; original files were preserved'),{code:'RECOVERY_REQUIRED'});}
  if(marker.kind!=='godot-mcp-upgrade'||marker.version!==1||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(marker.id??''))throw Object.assign(new Error('Unrecognized recovery journal; original files were preserved'),{code:'RECOVERY_REQUIRED'});
  const backupPath=await ensureProjectDirectory(root,['.godot-mcp','upgrade-backups',marker.id]);
  const data=await ordinaryBytes(path.join(backupPath,'manifest.json'),1024*1024);if(!data)throw failure('Upgrade backup manifest missing');
  const record=JSON.parse(data.toString()) as RecordData;
  if(record.version!==1||record.id!==marker.id||record.root.toLowerCase()!==(await fs.realpath(root)).toLowerCase()||!Array.isArray(record.entries)||record.entries.length>1024||!['prepared','applying','verifying','committed','rolled_back'].includes(record.state))throw failure('Invalid upgrade backup manifest');
  const names=new Set<string>();for(const entry of record.entries){validate(entry.relative);const key=entry.relative.toLowerCase();if(names.has(key)||!(/^[a-f0-9]{64}$/.test(entry.afterHash))||(entry.beforeHash!==null&&!/^[a-f0-9]{64}$/.test(entry.beforeHash)))throw failure('Invalid upgrade backup entry');names.add(key);}
  const journal=new UpgradeJournal(root,backupPath,record);
  if(['committed','rolled_back'].includes(record.state))await journal.clear();else await journal.rollback();
  return true;
 }
 async publish():Promise<void>{
  this.record.state='applying';await this.save();
  for(const entry of this.record.entries){
   const payload=await ordinaryBytes(await this.blob('after',entry.relative));if(hash(payload)!==entry.afterHash||payload===null)throw failure('Upgrade staged blob differs from its manifest');
   const file=await fileAt(this.root,entry.relative);if(hash(await ordinaryBytes(file))!==entry.beforeHash)throw failure('Installation changed during upgrade publication');
   await atomic(file,payload);
  }
  this.record.state='verifying';await this.save();
 }
 async commit():Promise<void>{
  for(const entry of this.record.entries)if(hash(await ordinaryBytes(await fileAt(this.root,entry.relative)))!==entry.afterHash)throw failure('Installation changed during verification; backups retained');
  this.record.state='committed';await this.save();await this.clear();
 }
 async rollback():Promise<void>{
  const restores:Array<{file:string;bytes:Buffer|null;expected:string|null}>=[];
  for(const entry of this.record.entries){
   const bytes=entry.beforeHash===null?null:await ordinaryBytes(await this.blob('before',entry.relative));
   if(hash(bytes)!==entry.beforeHash)throw failure('Upgrade backup hash mismatch; backups retained');
   const file=await fileAt(this.root,entry.relative),current=hash(await ordinaryBytes(file));
   if(current!==entry.beforeHash&&current!==entry.afterHash)throw failure('External edit conflicts with rollback; backups retained');
   restores.push({file,bytes,expected:current});
  }
  for(const restore of restores){
   if(hash(await ordinaryBytes(restore.file))!==restore.expected)throw failure('Installation changed during rollback; backups retained');
   if(hash(restore.bytes)===restore.expected)continue;
   if(restore.bytes===null)await fs.unlink(restore.file);else await atomic(restore.file,restore.bytes);
  }
  this.record.state='rolled_back';await this.save();await this.clear();
 }
}
