import fs from 'node:fs/promises';
import path from 'node:path';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {createMcpServer} from '../packages/server/dist/mcp/create-server.js';
import {createSession} from '../packages/server/dist/session/session.js';
import {SessionStore} from '../packages/server/dist/session/session-store.js';
import {BridgeServer} from '../packages/server/dist/bridge/bridge-server.js';
import {TOOL_NAMES} from '../packages/server/dist/tools/tool-catalog.js';

const session=createSession(process.cwd());
const bridge=new BridgeServer({session,token:'a'.repeat(64),port:0});
const server=createMcpServer({session,bridge,sessions:new SessionStore(session.projectRoot)});
const client=new Client({name:'catalog-generation',version:'1'});
const [ct,st]=InMemoryTransport.createLinkedPair();
try{
 await server.connect(st);await client.connect(ct);
 const tools=[];let cursor;
 do{const page=await client.listTools(cursor?{cursor}:{});tools.push(...page.tools);cursor=page.nextCursor;}while(cursor);
 tools.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 if(JSON.stringify(tools.map(t=>t.name))!==JSON.stringify(TOOL_NAMES))throw new Error('Catalog/registration mismatch');
 const json=JSON.stringify({version:1,tools},null,2)+'\n';
 const escape=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ');
 const markdown=[
  '# Godot MCP tool catalog','',
  'Generated from the actual MCP registration and its typed policy catalog. Run `npm run docs:tools` after changing a tool. Input schemas are retained in [catalog.json](catalog.json).','',
  'Permissions shown are baseline requirements; paths, trusted scripts and connected-editor recovery add conditional permissions. Risk can escalate for overwrites. Use `risk.preview` with exact arguments. Read-only annotations describe tool intent, not a sandbox for project code.','',
  '| Tool | Read only | Baseline risk | Permissions | Capabilities | Description |',
  '|---|---|---|---|---|---|',
  ...tools.map(tool=>{
   const metadata=tool._meta.godot_mcp;
   return `| ${tool.name} | ${tool.annotations.readOnlyHint} | ${metadata.risk} | ${metadata.permissions.join(', ')||'—'} | ${metadata.capabilities.join(', ')||'—'} | ${escape(tool.description)} |`;
  }), '',
 ].join('\n');
 for(const [name,content] of [['catalog.json',json],['catalog.md',markdown]]){
  const file=path.resolve('docs/tools',name);
  if(process.argv.includes('--check')){
   if(await fs.readFile(file,'utf8')!==content)throw new Error(`Stale generated tool documentation: ${name}`);
  }else{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);}
 }
 console.log(`Tool catalog ${process.argv.includes('--check')?'verified':'generated'}: ${tools.length} tools`);
}finally{await client.close();await server.close();}
