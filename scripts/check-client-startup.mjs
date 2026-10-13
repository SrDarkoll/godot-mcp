import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parse} from 'smol-toml';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const root=await fs.realpath(path.resolve(process.argv[2]??'.'));
const configFile=path.join(root,'.codex/config.toml');
const before=await fs.readFile(configFile,'utf8');
const launch=parse(before).mcp_servers?.['godot-mcp'];
assert(launch&&launch.enabled!==false,'Project Godot MCP launch is unavailable or disabled');
assert.equal(typeof launch.command,'string');
assert(Array.isArray(launch.args)&&launch.args.every(arg=>typeof arg==='string'));
const transport=new StdioClientTransport({command:launch.command,args:launch.args,cwd:root,stderr:'pipe',
 ...(launch.env?{env:{...process.env,...launch.env}}:{})});
const client=new Client({name:'godot-mcp-client-startup-check',version:'1'});
let stderr='';
transport.stderr?.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-8000);});
const timeout=setTimeout(()=>{void transport.close();},20000);
timeout.unref();
try{
 await client.connect(transport);
 const status=await client.callTool({name:'session.status',arguments:{}});
 assert.notEqual(status.isError,true,JSON.stringify(status));
 assert.equal(status.structuredContent.projectRoot,root);
 assert.equal(await fs.readFile(configFile,'utf8'),before,'Startup check must preserve the client configuration');
 console.log(JSON.stringify({passed:true,configFile,...status.structuredContent}));
}catch(error){
 if(stderr)console.error(stderr.slice(-8000));
 throw error;
}finally{
 clearTimeout(timeout);
 await client.close();
}
