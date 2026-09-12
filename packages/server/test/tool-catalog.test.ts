import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {expect,it,vi} from 'vitest';
import {TOOL_CATALOG,TOOL_NAMES} from '../src/tools/tool-catalog.js';
import {createMcpServer} from '../src/mcp/create-server.js';
import {createSession} from '../src/session/session.js';
import {SessionStore} from '../src/session/session-store.js';
import {BridgeServer} from '../src/bridge/bridge-server.js';
it('covers the entire MCP registration and exposes the same policies beside its actual input schemas',async()=>{
 const session=createSession(process.cwd());const sessions=new SessionStore(session.projectRoot);
 const bridge=new BridgeServer({session,token:'a'.repeat(64),port:0});
 const server=createMcpServer({session,sessions,bridge});
 const client=new Client({name:'catalog-test',version:'1'});
 const [ct,st]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(st);await client.connect(ct);
  const tools=[];let cursor:string|undefined;
  do{const page=await client.listTools(cursor?{cursor}:{});tools.push(...page.tools);cursor=page.nextCursor;}while(cursor);
  expect(tools.map(t=>t.name).sort()).toEqual(TOOL_NAMES);
  for(const tool of tools){
   const entry=TOOL_CATALOG[tool.name as keyof typeof TOOL_CATALOG];
   expect(tool.annotations?.readOnlyHint,tool.name).toBe(entry.readOnly);
   expect(tool._meta?.godot_mcp,tool.name).toMatchObject({risk:entry.risk,permissions:entry.permissions,capabilities:entry.capabilities});
   expect(tool.inputSchema.properties,tool.name).toHaveProperty('confirmation');
   expect(tool.description?.length,tool.name).toBeGreaterThan(0);
  }
  const capabilities=vi.spyOn(bridge,'capabilities','get').mockReturnValue({editor:false,runtime:false,debugger:false,viewport2d:false,viewport3d:false,undoRedo:false});
  const rpc=vi.spyOn(bridge.rpc,'call');
  try{
   const rejected=await client.callTool({name:'project.info',arguments:{}});
   expect(JSON.stringify(rejected)).toContain('CAPABILITY_UNAVAILABLE');
   expect(rpc).not.toHaveBeenCalled();
  }finally{capabilities.mockRestore();rpc.mockRestore();}
 }finally{await client.close();await server.close();}
});
