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

export async function readProjectConfig(root:string):Promise<ProjectConfig>{
 try{
  const directory=path.join(root,'.godot-mcp');
  const parent=await fs.lstat(directory);
  if(parent.isSymbolicLink()||!parent.isDirectory())throw new Error('Local config directory must not be a link');
  const file=path.join(directory,'config.json');const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size>1024*1024)throw new Error('Invalid local configuration file');
  return ConfigSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return ConfigSchema.parse({});throw new Error('Invalid or inaccessible project configuration');}
}

export async function writeProjectConfig(root:string,changes:{godotBin?:string|null;bridgePort?:number}):Promise<ProjectConfig>{
 const config=ConfigSchema.parse({...await readProjectConfig(root),...changes});
 const directory=await secureDirectory(root,['.godot-mcp']);
 const temporary=path.join(directory,`config-${randomUUID()}.tmp`);
 const handle=await fs.open(temporary,'wx');
 try{await handle.writeFile(JSON.stringify(config,null,2)+'\n');await handle.sync();}finally{await handle.close();}
 try{await fs.rename(temporary,path.join(directory,'config.json'));}finally{await fs.unlink(temporary).catch(()=>{});}
 return config;
}

export {secureDirectory as ensureProjectDirectory};
