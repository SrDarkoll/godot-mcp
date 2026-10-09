import path from 'node:path';
import {SERVER_VERSION,type ToolProfile} from '@godot-mcp/protocol';
import {resolveProjectRoot} from '@godot-mcp/server/project-root';
import {readProjectConfig} from '@godot-mcp/server/project-config';
import {serverStatus} from '@godot-mcp/server/management';
import {ordinaryBytes} from '../init/addon-journal.js';
import {makeClientLaunchEntry,type ClientLaunchEntry} from '../setup/client-config.js';
import {prepareCodexUpgrade} from '../setup/codex-upgrade.js';
import type {LauncherReplacement} from '../setup/codex-launch.js';

export type UpgradeStatus=Awaited<ReturnType<typeof serverStatus>>;
export interface PreviewOptions {projectRoot:string;client?:'codex';toolProfile?:ToolProfile;}
export interface UpgradePreview {
 projectRoot:string;fromVersion:string|null;toVersion:string;
 client:{path:string;changed:boolean;kind:'new'|'managed'|'legacy';previousLaunch:ClientLaunchEntry|null;proposedLaunch:ClientLaunchEntry;launcherReplacement:LauncherReplacement|null}|null;
 session:{sessionId:string;ownedGameMayStop:boolean}|null;
 requires:{stopSession:boolean;replaceLauncher:boolean};
 backupDirectory:string;nextCommand:string;
}

export async function statusForUpgrade(root:string):Promise<UpgradeStatus>{
 try{return await serverStatus(root);}catch(error){
  if((error as NodeJS.ErrnoException).code==='SERVER_UNAVAILABLE')return {state:'offline',projectRoot:root,editorConnected:false,runtimeConnected:false};
  throw error;
 }
}

export async function inspectUpgrade(options:PreviewOptions){
 const root=await resolveProjectRoot(options.projectRoot),config=await readProjectConfig(root);
 const codexFile=path.join(root,'.codex/config.toml');
 const useCodex=options.client==='codex'||await ordinaryBytes(codexFile)!==null;
 const entry=makeClientLaunchEntry(root,options.toolProfile??config.toolProfile,`@srdarkx/godot-mcp@${SERVER_VERSION}`);
 const clientPlan=useCodex?await prepareCodexUpgrade(codexFile,entry,{overrideProfile:options.toolProfile!==undefined}):null;
 const status=await statusForUpgrade(root);
 const fromVersion=(await ordinaryBytes(path.join(root,'addons/godot_mcp/plugin.cfg')))?.toString().match(/^version="([^"]+)"/m)?.[1]??null;
 const stopSession=status.state!=='offline',replaceLauncher=!!clientPlan?.launcherReplacement;
 const nextCommand=['npx --yes',`@srdarkx/godot-mcp@${SERVER_VERSION}`,'upgrade','.',
  ...(options.client?['--client codex']:[]),...(options.toolProfile?['--tool-profile '+options.toolProfile]:[]),
  ...(replaceLauncher?['--replace-launcher']:[]),...(stopSession?['--yes']:[])].join(' ');
 const preview:UpgradePreview={projectRoot:root,fromVersion,toVersion:SERVER_VERSION,
  client:clientPlan?{path:codexFile,changed:clientPlan.changed,kind:clientPlan.kind,previousLaunch:clientPlan.previousEntry??null,proposedLaunch:clientPlan.entry,launcherReplacement:clientPlan.launcherReplacement??null}:null,
  session:status.state==='offline'?null:{sessionId:status.sessionId,ownedGameMayStop:status.runtimeConnected},
  requires:{stopSession,replaceLauncher},backupDirectory:path.join(root,'.godot-mcp/upgrade-backups'),nextCommand};
 return {root,config,codexFile,useCodex,entry,clientPlan,status,preview};
}

/** No writes, Godot launch, lease acquisition or session shutdown. */
export async function previewUpgrade(options:PreviewOptions):Promise<UpgradePreview>{return (await inspectUpgrade(options)).preview;}

export function renderUpgradePreview(preview:UpgradePreview):string{
 const client=preview.client,replacement=client?.launcherReplacement;
 return [
  `Godot MCP upgrade: ${preview.fromVersion??'not installed'} -> ${preview.toVersion}`,
  `Project: ${preview.projectRoot}`,
  ...(client?[`Codex configuration: ${client.path}`,
   ...(replacement?[`Current launcher: ${replacement.kind==='wrapper'?'custom script '+path.basename(replacement.wrapperPath!):'local source checkout'}`,
    `Proposed launcher: npm @srdarkx/godot-mcp@${preview.toVersion}`,
    replacement.kind==='wrapper'?'Custom script behavior will no longer run in Codex. The script file will be kept.':'Codex will use the npm package instead of following changes in the local source checkout.']:[]),
   `Codex action: ${client.changed?'update this server entry and preserve other settings':'already configured'}`]:[]),
  preview.session?`Session: stop ${preview.session.sessionId}${preview.session.ownedGameMayStop?' (its owned game may also stop)':''}`:'Session: no active server to stop',
  `Backup location: ${preview.backupDirectory}`,
  'The addon and settings will be refreshed, then checked with doctor. Validation failure restores the backup.'
 ].join('\n');
}
