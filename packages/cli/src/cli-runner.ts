import path from 'node:path';
import {SERVER_VERSION,DEFAULT_PERMISSIONS} from '@godot-mcp/protocol';
import {runServer} from '@godot-mcp/server';
import {resolveProjectRoot} from '@godot-mcp/server/project-root';
import {readProjectConfig,writeProjectConfig} from '@godot-mcp/server/project-config';
import {serverStatus,stopServer} from '@godot-mcp/server/management';
import {listSessions,readSessionManifest} from '@godot-mcp/server/sessions';
import {parseCliArgs,usage} from './cli-args.js';
import {initProject} from './init/init-project.js';
import {doctor} from './doctor/doctor.js';
import {codexRecipe} from './setup/codex-recipe.js';

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
  switch(args.command){
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
    let godot=cliGodot;
    if(!godot){
     try{godot=(await readProjectConfig(root)).godotBin??process.env.GODOT_BIN??null;}catch{godot=process.env.GODOT_BIN??null;}
    }
    const report=await doctor({projectRoot:root,godotBin:godot});
    emit(report,report.checks.map(c=>`${c.ok?'OK':c.required===false?'INFO':'FAIL'} ${c.id}: ${c.detail}`).join('\n'));
    return report.ok?0:1;
   }
   case 'init':case 'addon.install':case 'addon.update':{
    const config=await readProjectConfig(root);
    const godot=cliGodot??config.godotBin??process.env.GODOT_BIN??null;
    const result=await initProject({projectRoot:root,godotBin:godot,enable:true});
    emit(result,[`Initialized Godot MCP in ${root}`,...result.warnings.map(w=>`Warning: ${w}`),...(result.backupPath?[`Previous addon files: ${result.backupPath}`]:[])].join('\n'));
    return 0;
   }
   case 'config':{
    const config=await readProjectConfig(root);
    const changes={...(args.godotBin?{godotBin:path.resolve(args.godotBin)}:{}),...(args.bridgePort===undefined?{}:{bridgePort:args.bridgePort}),...(args.toolProfile===undefined?{}:{toolProfile:args.toolProfile})};
    const saved=Object.keys(changes).length>0;
    const value=saved?await writeProjectConfig(root,changes):config;
    emit({protocol:value.protocol,bridgePort:value.bridgePort,godotBin:value.godotBin,toolProfile:value.toolProfile,saved,restartRequired:saved});return 0;
   }
  }
 }catch(error){
  const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'?error.code:'OPERATION_FAILED';
  const message=(error instanceof Error?error.message:'Operation failed').slice(0,2000);
  if(args.json)emit({ok:false,error:{code,message}});else console.error(message);
  return 1;
 }
}
