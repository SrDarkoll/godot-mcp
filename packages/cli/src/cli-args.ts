import { ToolProfileSchema, type ToolProfile } from '@godot-mcp/protocol';
import {CLIENT_NAMES,type ClientName} from './setup/client-config.js';
export type Command='help'|'version'|'init'|'doctor'|'start'|'stop'|'status'|'config'|'permissions'|'sessions.list'|'sessions.inspect'|'addon.install'|'addon.update'|'setup.codex';
export interface ParsedCommand {command:Command;projectRoot:string;godotBin:string|null;bridgePort?:number;toolProfile?:ToolProfile;client?:ClientName;json:boolean;limit:number;before?:string;sessionId?:string;repair?:boolean;}
export const SESSION_ID=/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z_[a-f0-9]{8}$/;
export function usage():string{return [
 'Usage: godot-mcp <command> [path] [options]',
 '  init [--godot <exe>] [--client <antigravity|cursor|claude>] [--tool-profile <profile>] [--json]',
 '  addon install | addon update [--godot <exe>] [--json]',
 '  doctor [--godot <exe>] [--json]',
 '  start [--bridge-port <0..65535>] [--tool-profile <profile>]  MCP stdio, no CLI output',
 '  status | stop | permissions [--json]',
 '  config [--godot <exe>] [--bridge-port <0..65535>] [--tool-profile <profile>] [--repair] [--json]',
 '  sessions list [--limit <1..200>] [--before <id>] [--json]',
 '  sessions inspect <id> [path] [--json]',
 '  setup codex [path] [--json]            print recipe; do not change profile',
 '  --help | --version'
].join('\n');}
export function parseCliArgs(argv:string[]):ParsedCommand{
 const base:ParsedCommand={command:'help',projectRoot:process.cwd(),godotBin:null,json:argv.includes('--json'),limit:20};
 if(!argv.length||argv.includes('--help')||argv.includes('-h'))return base;
 if(argv.includes('--version')||argv.includes('-v'))return {...base,command:'version'};
 let index=1;let name=argv[0]!;
 if(['sessions','addon','setup'].includes(name)){name+='.'+(argv[index++]??'');}
 const commands:Command[]=['init','doctor','start','stop','status','config','permissions','sessions.list','sessions.inspect','addon.install','addon.update','setup.codex'];
 if(!commands.includes(name as Command))throw new Error(`Unknown command: ${name}`);
 const parsed:ParsedCommand={...base,command:name as Command};
 if(name==='sessions.inspect'){const id=argv[index++];if(!id||!SESSION_ID.test(id))throw new Error('sessions inspect requires a valid session id');parsed.sessionId=id;}
 const seen=new Set<string>();let positional=false;
 for(;index<argv.length;index++){
  const arg=argv[index]!;
  if(!arg.startsWith('-')){if(positional)throw new Error(`Unexpected argument: ${arg}`);parsed.projectRoot=arg;positional=true;continue;}
  if(seen.has(arg))throw new Error(`Repeated option: ${arg}`);seen.add(arg);
  if(arg==='--json'){if(name==='start')throw new Error('start uses MCP stdio and cannot use --json');parsed.json=true;continue;}
  if(arg==='--repair'&&name==='config'){parsed.repair=true;continue;}
  const value=argv[++index];if(!value||value.startsWith('--'))throw new Error(`${arg} requires a value`);
  if(arg==='--godot'&&['init','doctor','config','addon.install','addon.update'].includes(name)){parsed.godotBin=value;continue;}
  if(arg==='--bridge-port'&&['config','start'].includes(name)){if(!/^\d+$/.test(value)||Number(value)>65535)throw new Error('Invalid bridge port');parsed.bridgePort=Number(value);continue;}
  if(arg==='--tool-profile'&&['init','config','start'].includes(name)){const profile=ToolProfileSchema.safeParse(value);if(!profile.success)throw new Error('Invalid tool profile');parsed.toolProfile=profile.data;continue;}
  if(arg==='--client'&&name==='init'){if(!CLIENT_NAMES.includes(value as ClientName))throw new Error('Invalid MCP client');parsed.client=value as ClientName;continue;}
  if(arg==='--limit'&&name==='sessions.list'){if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>200)throw new Error('Invalid session limit');parsed.limit=Number(value);continue;}
  if(arg==='--before'&&name==='sessions.list'){if(!SESSION_ID.test(value))throw new Error('Invalid session cursor');parsed.before=value;continue;}
  throw new Error(`Unknown or inapplicable option: ${arg}`);
 }
 return parsed;
}
