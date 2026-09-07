import {access,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runCommand} from '../process/run-command.js';

export interface GodotDiscoveryOptions {
 platform?:NodeJS.Platform;
 env?:NodeJS.ProcessEnv;
 homeDir?:string;
 validateCandidate?:(candidate:string)=>Promise<boolean>;
}

async function defaultValidate(candidate:string):Promise<boolean>{
 try{
  await access(candidate);
  const result=await runCommand(candidate,['--version'],{timeoutMs:5000,maxOutputBytes:64*1024});
  return result.code===0&&/^4\./.test((result.stdout+result.stderr).trim());
 }catch{return false;}
}

async function versionedWindowsExecutables(dir:string):Promise<string[]>{
 try{
  const entries=await readdir(dir,{withFileTypes:true});
  return entries
   .filter(entry=>entry.isFile()&&/^Godot.*\.exe$/i.test(entry.name)&&!/_console\.exe$/i.test(entry.name))
   .map(entry=>path.join(dir,entry.name))
   .sort((a,b)=>b.localeCompare(a));
 }catch{return [];}
}

export async function discoverGodotExecutable(options:GodotDiscoveryOptions={}):Promise<string|null>{
 const platform=options.platform??process.platform;
 const env=options.env??process.env;
 const home=options.homeDir??os.homedir();
 const validate=options.validateCandidate??defaultValidate;
 const candidates:string[]=[];
 const pathNames=platform==='win32'?['godot4.exe','godot.exe']:['godot4','godot'];
 for(const dir of (env.PATH??'').split(path.delimiter).filter(Boolean)){
  for(const name of pathNames)candidates.push(path.join(dir,name));
 }
 if(platform==='win32'){
  const dirs=[
   path.join(home,'Desktop'),
   path.join(home,'Downloads'),
   ...(env.LOCALAPPDATA?[path.join(env.LOCALAPPDATA,'Programs','Godot')]:[]),
   ...(env.ProgramFiles?[path.join(env.ProgramFiles,'Godot')]:[])
  ];
  for(const dir of dirs)candidates.push(...await versionedWindowsExecutables(dir));
 }else if(platform==='darwin'){
  candidates.push('/Applications/Godot.app/Contents/MacOS/Godot',path.join(home,'Applications','Godot.app','Contents','MacOS','Godot'));
 }else{
  candidates.push('/usr/bin/godot4','/usr/bin/godot','/usr/local/bin/godot4','/usr/local/bin/godot');
 }
 const seen=new Set<string>();
 for(const candidate of candidates){
  const resolved=path.resolve(candidate);
  const key=platform==='win32'?resolved.toLowerCase():resolved;
  if(seen.has(key))continue;
  seen.add(key);
  if(await validate(resolved))return resolved;
 }
 return null;
}
