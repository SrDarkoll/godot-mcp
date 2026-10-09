import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {SERVER_VERSION,type ToolProfile} from '@godot-mcp/protocol';
import {readProjectConfig,ensureProjectDirectory} from '@godot-mcp/server/project-config';
import {ProjectLease,requireNoRecoveryJournal} from '@godot-mcp/server/project-lease';
import {stopServer} from '@godot-mcp/server/management';
import {doctor,type DoctorReport} from '../doctor/doctor.js';
import {ordinaryBytes,AddonJournal} from '../init/addon-journal.js';
import {prepareCodexUpgrade} from '../setup/codex-upgrade.js';
import {readCodexConfig} from '../setup/codex-config.js';
import {runCommand} from '../process/run-command.js';
import {UpgradeJournal,type UpgradeChange} from './upgrade-journal.js';
import {inspectUpgrade,statusForUpgrade,type UpgradeStatus,type UpgradePreview} from './upgrade-preview.js';

export interface UpgradeOptions {
 projectRoot:string;godotBin:string;client?:'codex';toolProfile?:ToolProfile;yes?:boolean;replaceLauncher?:boolean;requireConfirmation?:boolean;
 confirmStop?:(status:Exclude<UpgradeStatus,{state:'offline'}>)=>Promise<boolean>;
 confirmUpgrade?:(preview:UpgradePreview)=>Promise<boolean>;
 onPreview?:(preview:UpgradePreview)=>void;
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

export async function upgradeProject(options:UpgradeOptions){
 if(process.platform!=='win32')throw Object.assign(new Error('Project upgrades currently require Windows; no files or sessions were changed'),{code:'UNSUPPORTED_PLATFORM'});
 const progress=options.onProgress??(()=>{});progress('Inspecting the installed addon and client configuration');
 const inspected=await inspectUpgrade(options),{root,codexFile,useCodex,entry,status,preview}=inspected;
 let {config,clientPlan}=inspected;let serverStopped=false;
 options.onPreview?.(preview);
 const needsReplacement=preview.requires.replaceLauncher&&!options.replaceLauncher;
 const needsStop=preview.requires.stopSession&&!options.yes;
 // Neither --yes nor JSON mode implicitly discards a custom launcher's behavior.
 if(needsReplacement||needsStop||options.requireConfirmation){
  if(options.confirmUpgrade){
   if(!await options.confirmUpgrade(preview))throw Object.assign(new Error('Upgrade cancelled; the session and files were preserved'),{code:'UPGRADE_CANCELLED'});
  }else if(needsReplacement){
   throw Object.assign(new Error('Codex uses a custom or source-checkout launcher. Replacing it with the npm launcher requires confirmation; the script file will be kept. No files or sessions were changed.\nRun interactively to review the change, or approve it from '+root+' with:\n'+preview.nextCommand),{code:'LAUNCHER_REPLACEMENT_REQUIRED',details:{preview,command:preview.nextCommand,projectRoot:root}});
  }else if(status.state!=='offline'){
   if(!options.confirmStop)throw Object.assign(new Error('An active Godot MCP session must be stopped. No files or sessions were changed.\nApprove the update from '+root+' with:\n'+preview.nextCommand),{code:'CONFIRMATION_REQUIRED',details:{sessionId:status.sessionId,preview,command:preview.nextCommand,projectRoot:root}});
   if(!await options.confirmStop(status))throw Object.assign(new Error('Upgrade cancelled; the session and files were preserved'),{code:'UPGRADE_CANCELLED'});
  }else throw Object.assign(new Error('Review and approve the existing installation upgrade from '+root+' with:\n'+preview.nextCommand),{code:'CONFIRMATION_REQUIRED',details:{preview,command:preview.nextCommand,projectRoot:root}});
 }
 const approvedPlan=clientPlan;
 const approvedCodex=clientPlan?.before??null;
 if(await readCodexConfig(codexFile)!==approvedCodex)throw Object.assign(new Error('Codex configuration changed after the preview. Run upgrade again to review the new plan; no files or sessions were changed.'),{code:'UPGRADE_PLAN_CHANGED'});
 let lease:ProjectLease|undefined;
 let journal:UpgradeJournal|undefined;
 try{
  if(status.state!=='offline'){
   progress('Stopping the authenticated project session');
   serverStopped=(await stopServer(root,{expectedSessionId:status.sessionId})).stopped;
  }
  lease=await ProjectLease.acquire(root,{operation:'addon_update',waitMs:5000});
  if((await statusForUpgrade(root)).state!=='offline')throw Object.assign(new Error('A project server restarted during upgrade. Stop it and retry; no files were changed.'),{code:'PROJECT_BUSY'});
  const recovered=await UpgradeJournal.recoverPending(root);
  await requireNoRecoveryJournal(root);await AddonJournal.recoverPending(root);
  config=await readProjectConfig(root);
  if(await readCodexConfig(codexFile)!==approvedCodex)throw Object.assign(new Error('Codex configuration changed after the preview. Run upgrade again to review the new plan.'),{code:'UPGRADE_PLAN_CHANGED'});
  if(useCodex){
   clientPlan=await prepareCodexUpgrade(codexFile,entry,{overrideProfile:options.toolProfile!==undefined});
   if(!approvedPlan||clientPlan.before!==approvedPlan.before||clientPlan.after!==approvedPlan.after)throw Object.assign(new Error('Codex configuration changed after the preview. Run upgrade again to review the new plan.'),{code:'UPGRADE_PLAN_CHANGED'});
  }
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
  const fromVersion=preview.fromVersion;
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
   client:clientPlan?{client:'codex',path:codexFile,migrated:clientPlan.kind==='legacy',changed:clientPlan.changed,launcherReplaced:!!clientPlan.launcherReplacement}:null,
   warnings:['Reload or rescan an open Godot project to activate the updated addon. Reconnect the MCP in your client to start the updated server.']};
 }catch(error){
  if(journal){
   progress('Restoring the previous installation');
   try{await journal.rollback();}catch{throw Object.assign(new Error('Upgrade could not restore files because a backup or external edit conflicts. Backups retained at '+journal.backupPath+'. Run upgrade again after resolving the conflict.'),{code:'UPGRADE_RECOVERY_REQUIRED',details:{backupPath:journal.backupPath}});}
   const cause=error as Error;
   throw Object.assign(new Error(cause.message+'. Previous files restored. Backup: '+journal.backupPath+(serverStopped?'. The MCP session remains stopped; reconnect your client.':'')),
    {code:(error as any).code??'UPGRADE_FAILED',details:{...((error as any).details??{}),restored:true,backupPath:journal.backupPath,serverStopped},cause});
  }
  if(serverStopped)throw Object.assign(new Error((error as Error).message+'. No new installation was applied; the MCP session remains stopped. Reconnect your client.'),{code:(error as any).code??'UPGRADE_FAILED',details:{serverStopped:true,installationApplied:false},cause:error});
  throw error;
 }finally{await lease?.release();}
}
