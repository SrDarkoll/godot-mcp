import {constants} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parse} from 'smol-toml';
import {SERVER_VERSION} from '@godot-mcp/protocol';
import type {ClientLaunchEntry} from './client-config.js';
import {BEGIN,END,readCodexConfig,renderCodexServer} from './codex-config.js';
import {normalizeCodexLaunch,type LauncherReplacement} from './codex-launch.js';

const PACKAGE='@srdarkx/godot-mcp';
const fail=(message:string)=>Object.assign(new Error(message),{code:'UPGRADE_CONFIG_UNRECOGNIZED'});
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const toml=(text:string)=>parse(text,{integersAsBigInt:'asNeeded',unsafeKeyBehaviour:'throw'});
export function hasCodexServer(text:string):boolean{return (toml(text) as any).mcp_servers?.['godot-mcp']!==undefined;}

export interface CodexUpgradePlan {file:string;before:string|null;after:string;changed:boolean;kind:'new'|'managed'|'legacy';entry:ClientLaunchEntry;previousEntry?:ClientLaunchEntry;launcherReplacement?:LauncherReplacement;}

export async function managedCodexLaunchMatches(text:string,expected:ClientLaunchEntry):Promise<boolean>{
 try{
  const data=toml(text) as any,server=data.mcp_servers?.['godot-mcp'];
  if(!object(server)||typeof server.command!=='string'||!Array.isArray(server.args)||!server.args.every((v:unknown)=>typeof v==='string'))return false;
  const root=expected.args[3]!,actual=await normalizeCodexLaunch({command:server.command,args:server.args},root);
  if(actual.launcherReplacement)return false;
  const expectedProfile=expected.args[expected.args.indexOf('--tool-profile')+1];
  if(actual.profile!==expectedProfile)return false;
  return actual.packageSpec===PACKAGE||actual.packageSpec===`${PACKAGE}@${SERVER_VERSION}`||actual.packageSpec===`${PACKAGE}@latest`;
 }catch{return false;}
}

function assignment(body:string,key:'command'|'args',value:unknown):string{
 const pattern=new RegExp(`^[\\t ]*${key}[\\t ]*=`, 'gm');const matches=[...body.matchAll(pattern)];
 if(matches.length!==1)throw fail('Ambiguous Codex launch assignment');
 const start=matches[0]!.index!,lineEnd=body.indexOf('\n',start);
 let end=lineEnd<0?body.length:lineEnd;
 for(let attempts=0;;attempts++){
  if(attempts>1024||end-start>65536)throw fail('Codex launch field exceeds the supported migration size');
  try{const parsed=toml(body.slice(start,end));if(Object.keys(parsed).length===1&&Object.hasOwn(parsed,key))break;}catch{}
  if(end===body.length)throw fail('Unable to identify Codex launch field safely');
  const next=body.indexOf('\n',end+1);end=next<0?body.length:next;
 }
 const eol=body.includes('\r\n')?'\r\n':'\n';
 return body.slice(0,start)+`${key} = ${JSON.stringify(value)}`+(body[end-1]==='\r'? '\r':'')+body.slice(end);
}

export async function prepareCodexUpgrade(file:string,entry:ClientLaunchEntry,options:{overrideProfile?:boolean}={}):Promise<CodexUpgradePlan>{
 try{const parent=await fs.lstat(path.dirname(file));if(parent.isSymbolicLink()||!parent.isDirectory())throw fail('Codex config directory must be an ordinary directory');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const before=await readCodexConfig(file);const text=before??'';
 let parsed:any;try{parsed=toml(text);}catch{throw fail('Codex config is invalid TOML; original files were preserved');}
 const server=parsed.mcp_servers?.['godot-mcp'];
 const begin=text.indexOf(BEGIN),end=text.indexOf(END);
 if((begin<0)!==(end<0)||(begin>=0&&(begin!==text.lastIndexOf(BEGIN)||end!==text.lastIndexOf(END)||end<begin)))throw fail('Incomplete or duplicate Codex management markers');
 const eol=text.includes('\r\n')?'\r\n':'\n';let after:string,kind:CodexUpgradePlan['kind'],effective=entry,previousEntry:ClientLaunchEntry|undefined,launcherReplacement:LauncherReplacement|undefined;
 if(server===undefined){
  if(begin>=0)throw fail('Managed Codex markers do not contain a server');
  const block=`${BEGIN}\n${renderCodexServer(entry)}${END}\n`.replaceAll('\n',eol);
  after=text+(text&&!text.endsWith('\n')?eol:'')+(text?eol:'')+block;kind='new';
 }else{
  if(!object(server)||typeof server.command!=='string'||!Array.isArray(server.args)||!server.args.every((v:unknown)=>typeof v==='string'))throw fail('Invalid Codex server launch');
  previousEntry={command:server.command,args:[...server.args]};
  const normalized=await normalizeCodexLaunch(previousEntry,entry.args[3]!);
  launcherReplacement=normalized.launcherReplacement;
  effective={command:'npx',args:normalized.args};
  if(options.overrideProfile&&normalized.profile!==null)effective.args[effective.args.indexOf('--tool-profile')+1]=entry.args[entry.args.indexOf('--tool-profile')+1]!;
  if(normalized.profile===null)effective.args.push('--tool-profile',entry.args[entry.args.indexOf('--tool-profile')+1]!);
  const headers=[...text.matchAll(/^[\t ]*\[([^\r\n]+)\][\t ]*(?:#[^\r\n]*)?\r?$/gm)];
  const roots=headers.filter(h=>/^\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\.\s*(?:godot-mcp|"godot-mcp"|'godot-mcp')\s*$/.test(h[1]!));
  if(roots.length!==1)throw fail('Codex server layout is ambiguous; configuration was preserved');
  const header=roots[0]!,bodyStart=header.index!+header[0].length;
  const following=headers.filter(h=>h.index!>header.index!);
  const rootEnd=following[0]?.index??text.length;
  let blockEnd=text.length;
  for(const next of following){try{const section=toml(next[0]) as any;if(section.mcp_servers?.['godot-mcp']!==undefined)continue;}catch{}blockEnd=next.index!;break;}
  let body=text.slice(bodyStart,rootEnd);body=assignment(body,'args',effective.args);body=assignment(body,'command',effective.command);
  const changedBody=text.slice(header.index!,bodyStart)+body+text.slice(rootEnd,blockEnd);
  if(begin>=0){
   if(header.index!<begin||blockEnd<end)throw fail('Codex server is outside its management markers');
   // Preserve the existing marker boundaries and every non-launch option.
   after=text.slice(0,bodyStart)+body+text.slice(rootEnd);kind='managed';
  }else{
   after=text.slice(0,header.index!)+BEGIN+eol+changedBody+(changedBody.endsWith('\n')?'':eol)+END+eol+text.slice(blockEnd);kind='legacy';
  }
 }
 const expected=toml(text) as any;
 expected.mcp_servers??=Object.create(null);expected.mcp_servers['godot-mcp']??=Object.create(null);
 expected.mcp_servers['godot-mcp'].command=effective.command;expected.mcp_servers['godot-mcp'].args=effective.args;
 if(!isDeepStrictEqual(toml(after),expected))throw fail('Codex migration would change unrelated settings; original files were preserved');
 return {file,before,after,changed:before!==after,kind,entry:effective,...(previousEntry?{previousEntry}:{}),...(launcherReplacement?{launcherReplacement}:{})};
}

export async function applyCodexUpgrade(plan:CodexUpgradePlan,options:{replaceLauncher?:boolean}={}):Promise<{changed:boolean;backupPath?:string}>{
 if(plan.launcherReplacement&&!options.replaceLauncher)throw Object.assign(new Error('Replacing this custom or source-checkout launcher requires explicit consent. Original configuration was preserved.'),{code:'LAUNCHER_REPLACEMENT_REQUIRED'});
 if(await readCodexConfig(plan.file)!==plan.before)throw fail('Codex configuration changed after upgrade preview');
 if(!plan.changed)return {changed:false};
 await fs.mkdir(path.dirname(plan.file),{recursive:true});
 const parent=await fs.lstat(path.dirname(plan.file));if(!parent.isDirectory()||parent.isSymbolicLink())throw fail('Unsafe Codex config directory');
 const backupPath=plan.before===null?undefined:plan.file+'.godot-mcp-'+randomUUID()+'.bak';
 if(backupPath)await fs.copyFile(plan.file,backupPath,constants.COPYFILE_EXCL);
 const temporary=plan.file+'.'+randomUUID()+'.tmp';
 try{
  await fs.writeFile(temporary,plan.after,{flag:'wx',mode:0o600});
  if(await readCodexConfig(plan.file)!==plan.before)throw fail('Codex configuration changed during upgrade');
  await fs.rename(temporary,plan.file);
 }finally{await fs.unlink(temporary).catch(()=>{});}
 return {changed:true,...(backupPath?{backupPath}:{})};
}
