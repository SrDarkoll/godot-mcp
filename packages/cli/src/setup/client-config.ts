import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {ToolProfile} from '@godot-mcp/protocol';

export const CLIENT_NAMES=['antigravity','cursor','claude'] as const;
export type ClientName=typeof CLIENT_NAMES[number];
export const DEFAULT_NPX_PACKAGE='@srdarkx/godot-mcp';

export interface ClientLaunchEntry {command:string;args:string[];}
export interface ClientConfigResult {
 client:ClientName;
 path:string;
 changed:boolean;
 backupPath?:string;
 entry:ClientLaunchEntry;
}
export interface ClientConfigOptions {
 client:ClientName;
 projectRoot:string;
 toolProfile:ToolProfile;
 env?:NodeJS.ProcessEnv;
 homeDir?:string;
 platform?:NodeJS.Platform;
 now?:()=>Date;
 npxPackage?:string;
}

function isRecord(value:unknown):value is Record<string,unknown>{
 return !!value&&typeof value==='object'&&!Array.isArray(value);
}

export function clientConfigPath(client:ClientName,projectRoot:string,options:{env?:NodeJS.ProcessEnv;homeDir?:string;platform?:NodeJS.Platform}={}):string{
 const env=options.env??process.env;
 const home=options.homeDir??os.homedir();
 const platform=options.platform??process.platform;
 if(client==='cursor')return path.resolve(env.GODOT_MCP_CURSOR_CONFIG??path.join(projectRoot,'.cursor','mcp.json'));
 if(client==='antigravity')return path.resolve(env.GODOT_MCP_ANTIGRAVITY_CONFIG??path.join(projectRoot,'.agents','mcp_config.json'));
 if(env.GODOT_MCP_CLAUDE_CONFIG)return path.resolve(env.GODOT_MCP_CLAUDE_CONFIG);
 if(platform==='win32')return path.resolve(path.join(env.APPDATA??path.join(home,'AppData','Roaming'),'Claude','claude_desktop_config.json'));
 if(platform==='darwin')return path.resolve(path.join(home,'Library','Application Support','Claude','claude_desktop_config.json'));
 return path.resolve(path.join(home,'.config','Claude','claude_desktop_config.json'));
}

function backupStamp(now:Date):string{
 return now.toISOString().replace(/[:.]/g,'-');
}

export async function configureClient(options:ClientConfigOptions):Promise<ClientConfigResult>{
 const projectRoot=path.resolve(options.projectRoot);
 const file=clientConfigPath(options.client,projectRoot,options);
 const entry:ClientLaunchEntry={
  command:'npx',
  args:['--yes',options.npxPackage??DEFAULT_NPX_PACKAGE,'start',projectRoot,'--tool-profile',options.toolProfile]
 };
 let text:string|null=null;
 let root:Record<string,unknown>={};
 try{
  text=await readFile(file,'utf8');
  let parsed:unknown;
  try{parsed=JSON.parse(text);}catch(error){throw new Error(`Invalid ${options.client} MCP config JSON: ${error instanceof Error?error.message:String(error)}`);}
  if(!isRecord(parsed))throw new Error(`Invalid ${options.client} MCP config: expected a JSON object`);
  root=parsed;
 }catch(error){
  if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
 }
 const existingServers=root.mcpServers;
 if(existingServers!==undefined&&!isRecord(existingServers))throw new Error(`Invalid ${options.client} MCP config: mcpServers must be a JSON object`);
 const servers:Record<string,unknown>={...(existingServers??{})};
 if(JSON.stringify(servers['godot-mcp'])===JSON.stringify(entry))return {client:options.client,path:file,changed:false,entry};
 servers['godot-mcp']=entry;
 const updated={...root,mcpServers:servers};
 await mkdir(path.dirname(file),{recursive:true});
 let backupPath:string|undefined;
 if(text!==null){
  backupPath=`${file}.godot-mcp-${backupStamp((options.now??(()=>new Date()))())}.bak`;
  await copyFile(file,backupPath);
 }
 await writeFile(file,JSON.stringify(updated,null,2)+'\n','utf8');
 return {client:options.client,path:file,changed:true,...(backupPath?{backupPath}:{}),entry};
}
