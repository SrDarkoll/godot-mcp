import fs from 'node:fs/promises';
import path from 'node:path';
import {SERVER_VERSION,ToolProfileSchema} from '@godot-mcp/protocol';
import type {ClientLaunchEntry} from './client-config.js';

const PACKAGE='@srdarkx/godot-mcp';
const fail=(message:string)=>Object.assign(new Error(message),{code:'UPGRADE_CONFIG_UNRECOGNIZED'});

export interface LauncherReplacement {
 kind:'source_checkout'|'wrapper';
 previous:ClientLaunchEntry;
 serverPath:string;
 wrapperPath?:string;
}

async function ordinaryFile(file:string,maxBytes:number):Promise<void>{
 try{
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>maxBytes)throw new Error('not an ordinary single-linked file');
 }catch{
  throw fail(`Cannot verify ${path.basename(file)} as an ordinary Godot MCP launch file. Original configuration was preserved.`);
 }
}

async function manifest(directory:string):Promise<Record<string,unknown>>{
 const file=path.join(directory,'package.json');await ordinaryFile(file,65536);
 try{
  const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await fs.readFile(file)));
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid manifest');
  return value as Record<string,unknown>;
 }catch{throw fail('A Godot MCP launcher package manifest is invalid; original configuration was preserved');}
}

async function nodeServer(file:string):Promise<'bundle'|'source_checkout'>{
 if(!path.isAbsolute(file)||!/[\\/]dist[\\/]index\.js$/.test(file))throw fail('The Node launcher does not identify a Godot MCP server entry; original configuration was preserved');
 await ordinaryFile(file,8*1024*1024);
 const server=path.dirname(path.dirname(file));
 if((await manifest(server)).name!=='@godot-mcp/server')throw fail('The Node entry does not belong to the Godot MCP server package; original configuration was preserved');
 if(path.basename(server)==='server'&&path.basename(path.dirname(server))==='packages'){
  const checkout=path.resolve(server,'../..'),workspace=await manifest(checkout),cli=await manifest(path.join(checkout,'packages/cli'));
  if(workspace.name!=='godot-mcp-monorepo'||workspace.private!==true||!Array.isArray(workspace.workspaces)||!workspace.workspaces.includes('packages/*')||cli.name!==PACKAGE){
   throw fail('The source checkout does not identify the Godot MCP workspace and public CLI; original configuration was preserved');
  }
  return 'source_checkout';
 }
 const bundle=path.resolve(server,'../../..');
 if(path.relative(bundle,server).split(path.sep).join('/')!=='node_modules/@godot-mcp/server'||(await manifest(bundle)).name!==PACKAGE){
  throw fail('The Node server does not belong to the public Godot MCP bundle; original configuration was preserved');
 }
 return 'bundle';
}

/** Inspect launch metadata only. Custom launchers are never imported or executed. */
export async function normalizeCodexLaunch(entry:ClientLaunchEntry,root:string):Promise<{args:string[];profile:string|null;packageSpec:string;launcherReplacement?:LauncherReplacement}>{
 const executable=path.basename(entry.command.replaceAll('\\','/')).toLowerCase();
 let tail:string[],spec:string,launcherReplacement:LauncherReplacement|undefined;
 if(['npx','npx.cmd','npx.exe'].includes(executable)){
  let index=0;while(['--yes','-y'].includes(entry.args[index]??''))index++;
  const packageOption=['--package','-p'].includes(entry.args[index]??'');
  if(packageOption)index++;
  spec=entry.args[index++]??'';
  if(!/^@srdarkx\/godot-mcp(?:@[a-zA-Z0-9.^~*<>=_-]+)?$/.test(spec))throw fail('Codex server does not launch the Godot MCP npm package; its configuration was preserved');
  tail=entry.args.slice(index);
  if(packageOption&&tail.shift()!=='godot-mcp')throw fail('Unrecognized npm launch command; original configuration was preserved');
 }else if(['node','node.exe'].includes(executable)){
  const first=entry.args[0]??'';
  const wrapped=!/[\\/]dist[\\/]index\.js$/.test(first);
  if(wrapped){
   if(!path.isAbsolute(first)||!/[.]([cm]?js)$/i.test(first))throw fail('Codex uses an unknown Node launcher. A local script followed by a verified Godot MCP server entry is required; original configuration was preserved.');
   await ordinaryFile(first,1024*1024);
  }
  const serverIndex=wrapped?1:0,serverPath=entry.args[serverIndex]??'',kind=await nodeServer(serverPath);
  if(wrapped||kind==='source_checkout')launcherReplacement={kind:wrapped?'wrapper':'source_checkout',previous:{command:entry.command,args:[...entry.args]},serverPath,...(wrapped?{wrapperPath:first}:{})};
  spec=PACKAGE;tail=['start',...entry.args.slice(serverIndex+1)];
 }else throw fail('Codex server uses an unrelated command; its configuration was preserved');
 if(['start','run'].includes(tail[0]??''))tail.shift();
 let target:string|undefined,profile:string|null=null;const flags:string[]=[];
 for(let index=0;index<tail.length;index++){
  const item=tail[index]!;
  if(['--project','-p'].includes(item)){if(target!==undefined)throw fail('Duplicate project arguments');target=tail[++index];}
  else if(item==='--tool-profile'){
   const value=tail[++index];if(profile!==null||!ToolProfileSchema.safeParse(value).success)throw fail('Invalid or duplicate tool profile');
   profile=value!;flags.push(item,value!);
  }else if(item==='--bridge-port'){
   const value=tail[++index];if(flags.includes(item)||!value||!/^\d+$/.test(value)||Number(value)>65535)throw fail('Invalid bridge port');flags.push(item,value);
  }else if(item.startsWith('-')||target!==undefined)throw fail('Unrecognized launch arguments; configuration was preserved');
  else target=item;
 }
 if(!target||path.resolve(root,target).toLowerCase()!==path.resolve(root).toLowerCase())throw fail('Codex server targets a different or unknown project; configuration was preserved');
 return {args:['--yes',`${PACKAGE}@${SERVER_VERSION}`,'start',root,...flags],profile,packageSpec:spec,...(launcherReplacement?{launcherReplacement}:{})};
}
