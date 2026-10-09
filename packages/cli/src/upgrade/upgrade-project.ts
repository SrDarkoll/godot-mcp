import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {SERVER_VERSION,type ToolProfile} from '@godot-mcp/protocol';
import {resolveProjectRoot} from '@godot-mcp/server/project-root';
import {readProjectConfig,ensureProjectDirectory} from '@godot-mcp/server/project-config';
import {ProjectLease,requireNoRecoveryJournal} from '@godot-mcp/server/project-lease';
import {serverStatus,stopServer} from '@godot-mcp/server/management';
import {doctor,type DoctorReport} from '../doctor/doctor.js';
import {ordinaryBytes,AddonJournal} from '../init/addon-journal.js';
import {makeClientLaunchEntry} from '../setup/client-config.js';
import {prepareCodexUpgrade} from '../setup/codex-upgrade.js';
import {runCommand} from '../process/run-command.js';
import {UpgradeJournal,type UpgradeChange} from './upgrade-journal.js';

type Status=Awaited<ReturnType<typeof serverStatus>>;
export interface UpgradeOptions {
 projectRoot:string;godotBin:string;client?:'codex';toolProfile?:ToolProfile;yes?:boolean;
 confirmStop?:(status:Exclude<Status,{state:'offline'}>)=>Promise<boolean>;
 onProgress?:(stage:string)=>void;
 verify?:typeof doctor;
}

export async function existingInstallation(root:string):Promise<boolean>{
 return await ordinaryBytes(path.join(root,'addons/godot_mcp/plugin.cfg'))!==null||await ordinaryBytes(path.join(root,'.godot-mcp/config.json'))!==null;
}

async function templateFiles(template:string,relative=''):Promise<Array<{relative:string;bytes:Buffer}>>{
 const result:Array<{relative:string;bytes:Buffer}>=[];
 for(const entry of await fs.readdir(path.join(template,relative),{withFileTypes:true})){
  if(entry.isSymbolicLink())throw new Error('Addon template contains a link');
  const name=path.join(relative,entry.name);
  if(entry.isDirectory())result.push(...await templateFiles(template,name));
  else if(entry.isFile()){const bytes=await ordinaryBytes(path.join(template,name));if(bytes===null)throw new Error('Addon template changed');result.push({relative:name.split(path.sep).join('/'),bytes});}
 }
 return result;
}

async function statusForUpgrade(root:string):Promise<Status>{
 try{return await serverStatus(root);}catch(error){
  if((error as any).code==='SERVER_UNAVAILABLE')return {state:'offline',projectRoot:root,editorConnected:false,runtimeConnected:false};
  throw error;
 }
}

export async function upgradeProject(options:UpgradeOptions){
 if(process.platform!=='win32')throw Object.assign(new Error('Project upgrades currently require Windows; no files or sessions were changed'),{code:'UNSUPPORTED_PLATFORM'});
 const root=await resolveProjectRoot(options.projectRoot);
 const progress=options.onProgress??(()=>{});progress('Inspecting the installed addon and client configuration');
 let config=await readProjectConfig(root);
 const codexFile=path.join(root,'.codex/config.toml');
 const useCodex=options.client==='codex'||await ordinaryBytes(codexFile)!==null;
 const entry=makeClientLaunchEntry(root,options.toolProfile??config.toolProfile,`@srdarkx/godot-mcp@${SERVER_VERSION}`);
 // No shutdown or installation changes until the client plan is known to be safe.
 let clientPlan=useCodex?await prepareCodexUpgrade(codexFile,entry,{overrideProfile:options.toolProfile!==undefined}):null;
 const status=await statusForUpgrade(root);let serverStopped=false;
 if(status.state!=='offline'){
  if(!options.yes&&!options.confirmStop)throw Object.assign(new Error('An active Godot MCP session must be stopped. Run upgrade again with --yes to approve stopping this project session.'),{code:'CONFIRMATION_REQUIRED',details:{sessionId:status.sessionId}});
  if(!options.yes&&!await options.confirmStop!(status))throw Object.assign(new Error('Upgrade cancelled; the session and files were preserved'),{code:'UPGRADE_CANCELLED'});
  progress('Stopping the authenticated project session');
  serverStopped=(await stopServer(root,{expectedSessionId:status.sessionId})).stopped;
 }
 const lease=await ProjectLease.acquire(root,{operation:'addon_update',waitMs:5000});
 let journal:UpgradeJournal|undefined;
 try{
  if((await statusForUpgrade(root)).state!=='offline')throw Object.assign(new Error('A project server restarted during upgrade. Stop it and retry; no files were changed.'),{code:'PROJECT_BUSY'});
  const recovered=await UpgradeJournal.recoverPending(root);
  await requireNoRecoveryJournal(root);await AddonJournal.recoverPending(root);
  config=await readProjectConfig(root);
  if(useCodex)clientPlan=await prepareCodexUpgrade(codexFile,entry,{overrideProfile:options.toolProfile!==undefined});
  const profile=options.toolProfile??(clientPlan?.entry.args.includes('--tool-profile')?clientPlan.entry.args[clientPlan.entry.args.indexOf('--tool-profile')+1] as ToolProfile:config.toolProfile);
  const require=createRequire(import.meta.url),template=path.join(path.dirname(require.resolve('@godot-mcp/godot-addon/package.json')),'addons/godot_mcp');
  const changes:UpgradeChange[]=[];
  const originalMetadata=new Map<string,Buffer|null>();
  for(const relative of ['project.godot','.gitignore','.codex/config.toml','.godot-mcp/config.json','.godot-mcp/generated/runtime_logger.gd'])originalMetadata.set(relative,await ordinaryBytes(path.join(root,relative)));
  const add=async(relative:string,after:Buffer)=>{
   const parts=relative.split('/'),name=parts.pop()!;const directory=await ensureProjectDirectory(root,parts);
   const before=originalMetadata.has(relative)?originalMetadata.get(relative)!:await ordinaryBytes(path.join(directory,name));if(before===null||!before.equals(after))changes.push({relative,before,after});
  };
  for(const file of await templateFiles(template))await add('addons/godot_mcp/'+file.relative,file.bytes);
  const beforeSettings=await ordinaryBytes(path.join(root,'project.godot'));if(beforeSettings===null)throw new Error('Project settings disappeared');
  const fromVersion=(await ordinaryBytes(path.join(root,'addons/godot_mcp/plugin.cfg')))?.toString().match(/^version="([^"]+)"/m)?.[1]??null;
  progress('Preparing settings and the addon without changing the saved project');
  const stage=await UpgradeJournal.stagingDirectory(root);
  const stagedSettings=path.join(stage,'project.godot'),stagedLogger=path.join(stage,'runtime_logger.gd');
  const prepared=await runCommand(options.godotBin,['--headless','--path',root,'--script',path.join(template,'tools/prepare_upgrade.gd'),'--',stagedSettings,stagedLogger,path.join(template,'runtime/runtime_logger_46.gd.txt')],{timeoutMs:30000,maxOutputBytes:512*1024});
  if(prepared.code!==0||!prepared.stdout.includes('GODOT_MCP_UPGRADE_PREPARED'))throw Object.assign(new Error('Godot could not prepare the upgrade: '+(prepared.stderr+prepared.stdout).slice(-2000)),{code:'UPGRADE_PREPARATION_FAILED'});
  if(!(await ordinaryBytes(path.join(root,'project.godot')))?.equals(beforeSettings))throw new Error('Project settings changed during upgrade preparation');
  const settings=await ordinaryBytes(stagedSettings);if(settings===null)throw new Error('Staged project settings are missing');await add('project.godot',settings);
  const logger=await ordinaryBytes(stagedLogger);if(logger)await add('.godot-mcp/generated/runtime_logger.gd',logger);
  await add('.godot-mcp/config.json',Buffer.from(JSON.stringify({...config,godotBin:options.godotBin,toolProfile:profile},null,2)+'\n'));
  if(clientPlan){
   const currentCodex=await ordinaryBytes(codexFile);
   if(currentCodex===null?clientPlan.before!==null:currentCodex.toString().replace(/^\uFEFF/,'')!==clientPlan.before)throw new Error('Codex config changed during upgrade preparation');
   await add('.codex/config.toml',Buffer.from(clientPlan.after));
  }
  let ignore=(await ordinaryBytes(path.join(root,'.gitignore')))?.toString()??'';if(ignore&&!ignore.endsWith('\n'))ignore+='\n';
  for(const line of ['.godot-mcp/runtime/','.godot-mcp/sessions/','.godot-mcp/generated/','.godot-mcp/config.json','.godot-mcp/addon-backups/','.godot-mcp/upgrade-backups/'])if(!ignore.split(/\r?\n/).includes(line))ignore+=line+'\n';
  await add('.gitignore',Buffer.from(ignore));
  progress('Backing up and publishing the verified installation');
  journal=await UpgradeJournal.prepare(root,changes);await journal.publish();
  progress('Checking the installation with doctor');
  const report:DoctorReport=await (options.verify??doctor)({projectRoot:root,godotBin:options.godotBin});
  if(!report.ok)throw Object.assign(new Error('Doctor found an installation problem'),{code:'UPGRADE_VALIDATION_FAILED',details:{checks:report.checks.filter(c=>!c.ok&&c.required!==false).map(c=>({id:c.id,detail:c.detail}))}});
  await journal.commit();
  return {projectRoot:root,fromVersion,toVersion:SERVER_VERSION,changed:changes.length>0,backupPath:journal.backupPath,serverStopped,recovered,doctor:report,
   client:clientPlan?{client:'codex',path:codexFile,migrated:clientPlan.kind==='legacy',changed:clientPlan.changed}:null,
   warnings:['Reload or rescan an open Godot project to activate the updated addon. Reconnect the MCP in your client to start the updated server.']};
 }catch(error){
  if(journal){
   progress('Restoring the previous installation');
   try{await journal.rollback();}catch{throw Object.assign(new Error('Upgrade could not restore files because a backup or external edit conflicts. Backups retained at '+journal.backupPath+'. Run upgrade again after resolving the conflict.'),{code:'UPGRADE_RECOVERY_REQUIRED',details:{backupPath:journal.backupPath}});}
   const cause=error as Error;
   throw Object.assign(new Error(cause.message+'. Previous files restored. Backup: '+journal.backupPath+(serverStopped?'. The MCP session remains stopped; reconnect your client.':'')),
    {code:(error as any).code??'UPGRADE_FAILED',details:{...((error as any).details??{}),restored:true,backupPath:journal.backupPath,serverStopped},cause});
  }
  if(serverStopped)throw Object.assign(new Error((error as Error).message+'. No installation files were changed; the MCP session remains stopped. Reconnect your client.'),{code:(error as any).code??'UPGRADE_FAILED',details:{serverStopped:true,filesChanged:false},cause:error});
  throw error;
 }finally{await lease.release();}
}
