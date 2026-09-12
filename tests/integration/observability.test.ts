import fs from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import WebSocket from 'ws';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {expect,it} from 'vitest';
it('measures a real bridge disconnect and exports through MCP stdio',async()=>{
 const parent=path.resolve('.godot-mcp/cli-test-runs');await fs.mkdir(parent,{recursive:true});
 const root=await fs.mkdtemp(path.join(parent,'observability-'));await fs.writeFile(path.join(root,'project.godot'),'config_version=5\n');
 const client=new Client({name:'observability-integration',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/cli/dist/index.js'),'start',root,'--bridge-port','0']});
 let socket:WebSocket|undefined;
 try{
  await client.connect(transport);
  const descriptor=JSON.parse(await fs.readFile(path.join(root,'.godot-mcp/runtime/bridge.json'),'utf8'));
  socket=new WebSocket(`ws://127.0.0.1:${descriptor.port}`);await once(socket,'open');
  const ack=once(socket,'message');
  socket.send(JSON.stringify({type:'hello',protocol:1,token:descriptor.token,projectRoot:root,godotVersion:'4.6.3',addonVersion:'0.1.0',capabilities:{editor:true,runtime:false,debugger:false,viewport2d:false,viewport3d:false,undoRedo:false}}));
  expect(JSON.parse(String((await ack)[0])).type).toBe('hello_ack');
  expect((await client.callTool({name:'session.metrics',arguments:{}})).structuredContent).toMatchObject({editorConnected:true,disconnects:0});
  const closed=once(socket,'close');socket.close();await closed;
  let metrics:any;
  for(let i=0;i<20;i++){
   metrics=(await client.callTool({name:'session.metrics',arguments:{}})).structuredContent;
   if(metrics.disconnects===1)break;
   await new Promise(r=>setTimeout(r,20));
  }
  expect(metrics).toMatchObject({editorConnected:false,disconnects:1});
  const before=(await client.callTool({name:'project.events',arguments:{}})).structuredContent as any;
  expect(before.events.map((e:any)=>e.event)).toEqual(['editor.connected','editor.disconnected']);
  socket=new WebSocket(`ws://127.0.0.1:${descriptor.port}`);await once(socket,'open');
  const reconnected=once(socket,'message');
  socket.send(JSON.stringify({type:'hello',protocol:1,token:descriptor.token,projectRoot:root,godotVersion:'4.6.3',addonVersion:'0.1.0',capabilities:{editor:true,runtime:false,debugger:false,viewport2d:false,viewport3d:false,undoRedo:false}}));
  await reconnected;
  socket.send(JSON.stringify({type:'event',protocol:1,sessionId:descriptor.sessionId,sequence:1,event:'project.changed',data:{kind:'scene.saved',path:'res://main.tscn',dropped:2}}));
  let resumed:any;
  for(let i=0;i<20;i++){
   resumed=(await client.callTool({name:'project.events',arguments:{after:before.nextCursor,wait_ms:100}})).structuredContent;
   if(resumed.events.some((e:any)=>e.event==='scene.saved'))break;
  }
  expect(resumed.events.some((e:any)=>e.event==='scene.saved'&&e.data.dropped===2)).toBe(true);
  expect(resumed.events.every((e:any)=>e.cursor>before.nextCursor)).toBe(true);
  const exported=await client.callTool({name:'session.export',arguments:{}});
  expect(exported.isError).not.toBe(true);
  const index=JSON.parse(await fs.readFile(path.join(String(exported.structuredContent!.path),'export.json'),'utf8'));
  expect(index.complete).toBe(true);expect(index.files).toHaveLength(2);
 }finally{socket?.terminate();await client.close();}
},20000);
