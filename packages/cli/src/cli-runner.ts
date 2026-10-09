import path from 'node:path';
import {createInterface} from 'node:readline/promises';
import {SERVER_VERSION,DEFAULT_PERMISSIONS} from '@godot-mcp/protocol';
import {runServer} from '@godot-mcp/server';
import {resolveProjectRoot} from '@godot-mcp/server/project-root';
import {readProjectConfig,writeProjectConfig,repairProjectConfig} from '@godot-mcp/server/project-config';
import {serverStatus,stopServer} from '@godot-mcp/server/management';
import {listSessions,readSessionManifest} from '@godot-mcp/server/sessions';
import {parseCliArgs,usage} from './cli-args.js';
import {initProject} from './init/init-project.js';
import {doctor} from './doctor/doctor.js';
import {codexRecipe} from './setup/codex-recipe.js';
import {configureClient} from './setup/client-config.js';
import {discoverGodotExecutable} from './setup/godot-discovery.js';
import {upgradeProject,existingInstallation} from './upgrade/upgrade-project.js';
import {prepareCodexUpgrade} from './setup/codex-upgrade.js';
import {makeClientLaunchEntry} from './setup/client-config.js';

async function confirm(question:string):Promise<boolean>{
 const readline=createInterface({input:process.stdin,output:process.stderr});
 try{return /^(y|yes|s|si|sí)$/i.test((await readline.question(question+' [y/N] ')).trim());}finally{readline.close();}
}

async function resolveGodot(projectRoot:string,cliGodot:string|null):Promise<string|null>{
 if(cliGodot)return cliGodot;
 try{
  const configured=(await readProjectConfig(projectRoot)).godotBin;
  if(configured)return configured;
 }catch{}
 if(process.env.GODOT_BIN)return path.resolve(process.env.GODOT_BIN);
 return await discoverGodotExecutable();
}

export async function runCli(argv=process.argv.slice(2)):Promise<number>{
 let args;
 try{args=parseCliArgs(argv);}catch(error){
  const message=error instanceof Error?error.message:'Invalid arguments';
  if(argv.includes('--json')&&argv[0]!=='start')console.log(JSON.stringify({ok:false,error:{code:'INVALID_ARGUMENT',message}}));
  else console.error(message+'\n'+usage());
  return 2;
 }
 const emit=(value:object,text?:string)=>console.log(args.json?JSON.stringify(value):text??JSON.stringify(value,null,2));
 if(args.command==='help'){emit({usage:usage()},usage());return 0;}
 if(args.command==='version'){emit({version:SERVER_VERSION},SERVER_VERSION);return 0;}
 try{
  const root=await resolveProjectRoot(args.projectRoot);
  if(args.command==='start'){
   await runServer(['--project',root,...(args.bridgePort===undefined?[]:['--bridge-port',String(args.bridgePort)]),...(args.toolProfile===undefined?[]:['--tool-profile',args.toolProfile])]);
   return 0;
  }
  const cliGodot=args.godotBin?path.resolve(args.godotBin):null;
  const executeUpgrade=async()=>{
   const godot=await resolveGodot(root,cliGodot);
   if(!godot)throw Object.assign(new Error('Godot could not be found. Pass --godot with its executable path; no files were changed.'),{code:'GODOT_NOT_FOUND'});
   const interactive=!args.json&&process.stdin.isTTY&&process.stderr.isTTY;
   const result=await upgradeProject({projectRoot:root,godotBin:godot,...(args.client==='codex'?{client:'codex' as const}:{}),
    ...(args.toolProfile?{toolProfile:args.toolProfile}:{}),yes:args.yes===true,
    ...(interactive?{confirmStop:async(status:Exclude<Awaited<ReturnType<typeof serverStatus>>,{state:'offline'}>)=>confirm(`Stop Godot MCP session ${status.sessionId}${status.runtimeConnected?' and its owned game':''} to update this project?`)}:{}),
    onProgress:stage=>{if(!args.json)console.error(stage);}});
   emit(result,[`Godot MCP ${result.toVersion} installed in ${root}`,`Backup: ${result.backupPath}`,
    ...(result.client?[`Codex configuration ${result.client.migrated?'migrated':'verified'}: ${result.client.path}`]:[]),
    'Doctor: passed',...result.warnings].join('\n'));return 0;
  };
  switch(args.command){
   case 'upgrade':return await executeUpgrade();
   case 'status':emit(await serverStatus(root));return 0;
   case 'stop':emit(await stopServer(root));return 0;
   case 'permissions':{
    const status=await serverStatus(root);
    emit(status.state==='offline'?{source:'defaults',permissions:DEFAULT_PERMISSIONS}:{source:'live',sessionId:status.sessionId,permissions:status.permissions});return 0;
   }
   case 'sessions.list':emit(await listSessions(root,args.limit,args.before));return 0;
   case 'sessions.inspect':emit(await readSessionManifest(root,args.sessionId!));return 0;
   case 'setup.codex':{
    const recipe=codexRecipe(root);
    emit(recipe,'Codex configuration recipe (profile not modified):\n\n'+recipe.toml+'\nCommand arguments:\n'+JSON.stringify(recipe.command));return 0;
   }
   case 'doctor':{
    const godot=await resolveGodot(root,cliGodot);
    const report=await doctor({projectRoot:root,godotBin:godot});
    emit(report,report.checks.map(c=>`${c.ok?'OK':c.required===false?'INFO':'FAIL'} ${c.id}: ${c.detail}`).join('\n'));
    return report.ok?0:1;
   }
   case 'init':case 'addon.install':case 'addon.update':{
    if(args.command==='init'&&(!args.client||args.client==='codex')){
     let existing=await existingInstallation(root);
     if(args.client==='codex'){
      const config=await readProjectConfig(root);
      const plan=await prepareCodexUpgrade(path.join(root,'.codex/config.toml'),makeClientLaunchEntry(root,args.toolProfile??config.toolProfile,`@srdarkx/godot-mcp@${SERVER_VERSION}`));
      existing ||= plan.kind!=='new';
     }
     if(existing){
      if(!args.yes){
       if(args.json||!process.stdin.isTTY||!process.stderr.isTTY)throw Object.assign(new Error('Existing Godot MCP installation detected. Run upgrade for backup, Codex migration and verification, or init --yes to select that flow.'),{code:'UPGRADE_AVAILABLE',details:{command:'npx --yes @srdarkx/godot-mcp@latest upgrade '+JSON.stringify(root)}});
       if(!await confirm('An existing Godot MCP installation was found. Upgrade it with backup and verification?'))throw Object.assign(new Error('Initialization cancelled; existing files were preserved'),{code:'UPGRADE_CANCELLED'});
      }
      return await executeUpgrade();
     }
    }
    const godot=await resolveGodot(root,cliGodot);
    const result=await initProject({projectRoot:root,godotBin:godot,enable:true,
      operation:args.command==='init'?'project_init':args.command==='addon.install'?'addon_install':'addon_update'});
    let config=await readProjectConfig(root);
    if(args.command==='init'&&args.toolProfile)config=await writeProjectConfig(root,{toolProfile:args.toolProfile});
    const client=args.command==='init'&&args.client?await configureClient({client:args.client,projectRoot:root,toolProfile:config.toolProfile}):null;
    const output={...result,godotBin:godot,...(client?{client}:{})};
    emit(output,[`Initialized Godot MCP in ${root}`,...(client?[`Configured ${client.client}: ${client.path}${client.backupPath?` (backup: ${client.backupPath})`:''}`]:[]),...result.warnings.map(w=>`Warning: ${w}`),...(result.backupPath?[`Previous addon files: ${result.backupPath}`]:[])].join('\n'));
    return 0;
   }
   case 'config':{
    const changes={...(args.godotBin?{godotBin:path.resolve(args.godotBin)}:{}),...(args.bridgePort===undefined?{}:{bridgePort:args.bridgePort}),...(args.toolProfile===undefined?{}:{toolProfile:args.toolProfile})};
    const repaired=args.repair?await repairProjectConfig(root,changes):null;
    const config=repaired?repaired.config:await readProjectConfig(root);
    const saved=repaired!==null||Object.keys(changes).length>0;
    const value=repaired?repaired.config:(saved?await writeProjectConfig(root,changes):config);
    emit({protocol:value.protocol,bridgePort:value.bridgePort,godotBin:value.godotBin,toolProfile:value.toolProfile,saved,restartRequired:saved,...(repaired?.backupPath?{backupPath:repaired.backupPath}:{})});return 0;
   }
  }
 }catch(error){
  const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'?error.code:'OPERATION_FAILED';
  const message=(error instanceof Error?error.message:'Operation failed').slice(0,2000);
  const details=error&&typeof error==='object'&&'details' in error?error.details:undefined;
  if(args.json)emit({ok:false,error:{code,message,...(details&&typeof details==='object'?{details}:{})}});else console.error(message);
  return 1;
 }
}
