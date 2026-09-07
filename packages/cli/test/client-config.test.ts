import {mkdtemp,readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {expect,it} from 'vitest';
import {clientConfigPath,configureClient} from '../src/setup/client-config.js';

async function tempRoot():Promise<string>{return await mkdtemp(path.join(tmpdir(),'godot-mcp-client-'));}

it('creates project-local Cursor config and preserves unrelated MCP state with one backup',async()=>{
 const root=await tempRoot();
 const file=path.join(root,'.cursor','mcp.json');
 await mkdir(path.dirname(file),{recursive:true});
 await writeFile(file,JSON.stringify({theme:'dark',mcpServers:{other:{command:'other'}}},null,2));
 const first=await configureClient({client:'cursor',projectRoot:root,toolProfile:'2d',now:()=>new Date('2026-09-07T12:00:00.000Z')});
 expect(first.changed).toBe(true);
 expect(first.backupPath).toBeTruthy();
 const parsed=JSON.parse(await readFile(file,'utf8'));
 expect(parsed.theme).toBe('dark');
 expect(parsed.mcpServers.other).toEqual({command:'other'});
 expect(parsed.mcpServers['godot-mcp']).toEqual({command:'npx',args:['--yes','@godot-mcp/cli','start',path.resolve(root),'--tool-profile','2d']});
 const second=await configureClient({client:'cursor',projectRoot:root,toolProfile:'2d',now:()=>new Date('2026-09-07T12:00:01.000Z')});
 expect(second.changed).toBe(false);
 const backups=(await readdir(path.dirname(file))).filter(name=>name.includes('.godot-mcp-')&&name.endsWith('.bak'));
 expect(backups).toHaveLength(1);
});

it('fails closed for malformed or structurally invalid client config',async()=>{
 const root=await tempRoot();
 const file=path.join(root,'.cursor','mcp.json');
 await mkdir(path.dirname(file),{recursive:true});
 await writeFile(file,'{broken');
 await expect(configureClient({client:'cursor',projectRoot:root,toolProfile:'full'})).rejects.toThrow(/Invalid cursor MCP config JSON/);
 await writeFile(file,JSON.stringify({mcpServers:[]}));
 await expect(configureClient({client:'cursor',projectRoot:root,toolProfile:'full'})).rejects.toThrow(/mcpServers must be a JSON object/);
});

it('uses workspace-local Antigravity config and honors explicit user-config overrides',async()=>{
 const root=await tempRoot();
 const antigravity=path.join(root,'antigravity.json');
 const claude=path.join(root,'claude.json');
 expect(clientConfigPath('antigravity',root,{env:{},homeDir:root,platform:'win32'})).toBe(path.resolve(root,'.agents','mcp_config.json'));
 expect(clientConfigPath('antigravity',root,{env:{GODOT_MCP_ANTIGRAVITY_CONFIG:antigravity},homeDir:root,platform:'win32'})).toBe(path.resolve(antigravity));
 expect(clientConfigPath('claude',root,{env:{GODOT_MCP_CLAUDE_CONFIG:claude},homeDir:root,platform:'win32'})).toBe(path.resolve(claude));
});
