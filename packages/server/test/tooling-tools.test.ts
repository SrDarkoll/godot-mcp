import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { BridgeServer } from '../src/bridge/bridge-server.js';
import { createMcpServer } from '../src/mcp/create-server.js';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';

async function setup(profile:'minimal'|'3d'='minimal') {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-tooling-'));
  const session=createSession(root); const sessions=new SessionStore(root); await sessions.create(session);
  const bridge=new BridgeServer({session,token:'c'.repeat(64),port:0});
  const server=createMcpServer({session,bridge,sessions,toolProfile:profile});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  const client=new Client({name:'tooling-test',version:'1.0.0'});
  await server.connect(serverTransport); await client.connect(clientTransport);
  return {client,server};
}

it('discovers the active profile without requiring an editor connection',async()=>{
  const {client,server}=await setup('minimal');
  try{
    expect((await client.listTools()).tools.map(tool=>tool.name).sort()).toContain('godot.tools');
    const result=await client.callTool({name:'godot.tools',arguments:{}});
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({activeProfile:'minimal',selectedProfile:'minimal',total:5,offset:0,limit:25,nextOffset:null});
    expect((result.structuredContent as any).tools.map((tool:any)=>tool.name)).toEqual([
      'godot.capabilities','godot.tools','project.info','scene.get_tree','session.status'
    ]);
  }finally{await client.close();await server.close();}
});

it('filters inactive profile metadata with bounded alphabetical pagination',async()=>{
  const {client,server}=await setup('minimal');
  try{
    const first=await client.callTool({name:'godot.tools',arguments:{profile:'3d',domain:'navigation',query:'mesh',limit:2}});
    expect(first.isError).not.toBe(true);
    const body=first.structuredContent as any;
    expect(body).toMatchObject({activeProfile:'minimal',selectedProfile:'3d',offset:0,limit:2,nextOffset:2});
    expect(body.total).toBeGreaterThan(2);
    expect(body.tools).toHaveLength(2);
    expect(body.tools.every((tool:any)=>tool.domain==='navigation'&&tool.active===false&&tool.name.includes('mesh'))).toBe(true);
    const second=await client.callTool({name:'godot.tools',arguments:{profile:'3d',domain:'navigation',query:'mesh',offset:2,limit:2}});
    const names=[...body.tools,...((second.structuredContent as any).tools)].map((tool:any)=>tool.name);
    expect(names).toEqual([...names].sort());
  }finally{await client.close();await server.close();}
});
