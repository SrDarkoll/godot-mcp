import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import * as z from 'zod/v4';
import {secureDirectory} from '../recovery/project-files.js';

const ConfigSchema=z.object({
 protocol:z.literal(1).default(1),
 bridgePort:z.number().int().min(0).max(65535).default(61337),
 godotBin:z.string().min(1).nullable().default(null)
}).passthrough();
export type ProjectConfig=z.infer<typeof ConfigSchema>;

async function configBytes(root:string):Promise<Buffer|null>{
 try{
  const directory=path.join(root,'.godot-mcp');
  const parent=await fs.lstat(directory);
  if(parent.isSymbolicLink()||!parent.isDirectory())throw new Error('Local config directory must not be a link');
  const file=path.join(directory,'config.json');const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size>1024*1024)throw new Error('Invalid local configuration file');
  const bytes=await fs.readFile(file);
  if(bytes.length>1024*1024)throw new Error('Configuration exceeds 1 MiB');
  return bytes;
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}

export async function readProjectConfig(root:string):Promise<ProjectConfig>{
 try{
  const bytes=await configBytes(root);
  return ConfigSchema.parse(bytes===null?{}:JSON.parse(bytes.toString('utf8')));
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return ConfigSchema.parse({});throw new Error('Invalid or inaccessible project configuration');}
}

export async function writeProjectConfig(root:string,changes:{godotBin?:string|null;bridgePort?:number}):Promise<ProjectConfig>{
 const config=ConfigSchema.parse({...await readProjectConfig(root),...changes});
 await publishConfig(root,config);
 return config;
}

async function publishConfig(root:string,config:ProjectConfig):Promise<void>{
 const directory=await secureDirectory(root,['.godot-mcp']);
 const temporary=path.join(directory,`config-${randomUUID()}.tmp`);
 const handle=await fs.open(temporary,'wx');
 try{await handle.writeFile(JSON.stringify(config,null,2)+'\n');await handle.sync();}finally{await handle.close();}
 try{await fs.rename(temporary,path.join(directory,'config.json'));}finally{await fs.unlink(temporary).catch(()=>{});}
}

/** Explicit repair keeps the original bytes before replacing invalid known fields. */
export async function repairProjectConfig(root:string,changes:{godotBin?:string|null;bridgePort?:number}):Promise<{config:ProjectConfig;backupPath:string|null}>{
 const before=await configBytes(root);
 let object:Record<string,unknown>={};
 if(before){try{const parsed:unknown=JSON.parse(before.toString('utf8'));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))object=parsed as Record<string,unknown>;}catch{/* Original bytes are retained below. */}}
 const defaults=ConfigSchema.parse({});
 const config=ConfigSchema.parse({...object,
  protocol:1,
  bridgePort:ConfigSchema.shape.bridgePort.safeParse(object.bridgePort).success?object.bridgePort:defaults.bridgePort,
  godotBin:ConfigSchema.shape.godotBin.safeParse(object.godotBin).success?object.godotBin:defaults.godotBin,
  ...changes,
 });
 let backupPath:string|null=null;
 if(before!==null){
  const directory=await secureDirectory(root,['.godot-mcp','config-backups']);
  backupPath=path.join(directory,`${randomUUID()}.json`);
  const handle=await fs.open(backupPath,'wx');
  try{await handle.writeFile(before);await handle.sync();}finally{await handle.close();}
 }
 const current=await configBytes(root);
 if(current===null?before!==null:before===null||!current.equals(before))throw new Error('Configuration changed during repair; backup retained');
 await publishConfig(root,config);
 return {config,backupPath};
}

export {secureDirectory as ensureProjectDirectory};
