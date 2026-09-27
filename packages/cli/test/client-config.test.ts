import {mkdtemp,readFile,readdir,writeFile,mkdir,link} from 'node:fs/promises';
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
 expect(parsed.mcpServers['godot-mcp']).toEqual({command:'npx',args:['--yes','@srdarkx/godot-mcp','start',path.resolve(root),'--tool-profile','2d']});
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

it('creates and updates a project-local Codex MCP table without changing user settings',async()=>{
 const root=await tempRoot();
 const file=path.join(root,'.codex','config.toml');
 const userFile=path.join(root,'user-home','.codex','config.toml');
 await mkdir(path.dirname(file),{recursive:true});
 await mkdir(path.dirname(userFile),{recursive:true});
 await writeFile(file,'model = "existing-model"\n\n[mcp_servers.other]\ncommand = "other"\n');
 await writeFile(userFile,'model = "personal-model"\n');
 const options={client:'codex' as const,projectRoot:root,toolProfile:'2d' as const,
  homeDir:path.dirname(path.dirname(userFile)),env:{},platform:'win32' as const};
 const first=await configureClient({...options,now:()=>new Date('2026-09-27T12:00:00.000Z')});
 expect(first).toMatchObject({client:'codex',path:file,changed:true,entry:{
  command:'npx',args:['--yes','@srdarkx/godot-mcp','start',path.resolve(root),'--tool-profile','2d']
 }});
 expect(first.backupPath).toBeTruthy();
 const written=await readFile(file,'utf8');
 expect(written).toContain('model = "existing-model"');
 expect(written).toContain('[mcp_servers.other]');
 expect(written).toContain('[mcp_servers.godot-mcp]');
 expect(written).toContain(`args = ${JSON.stringify(first.entry.args)}`);
 expect(await readFile(userFile,'utf8')).toBe('model = "personal-model"\n');
 expect((await configureClient(options)).changed).toBe(false);
 const updated=await configureClient({...options,toolProfile:'3d',now:()=>new Date('2026-09-27T12:00:01.000Z')});
 expect(updated.changed).toBe(true);
 expect((await readFile(file,'utf8'))).toContain('"--tool-profile","3d"');
 expect((await readdir(path.dirname(file))).filter(name=>name.endsWith('.bak'))).toHaveLength(2);
});

it('refuses to replace an unmanaged or linked Codex config',async()=>{
 const root=await tempRoot();
 const file=path.join(root,'.codex','config.toml');
 const options={client:'codex' as const,projectRoot:root,toolProfile:'full' as const,
  env:{},homeDir:root,platform:'win32' as const};
 await mkdir(path.dirname(file),{recursive:true});
 const existing='[mcp_servers.godot-mcp]\ncommand = "custom"\n';
 await writeFile(file,existing);
 await expect(configureClient(options)).rejects.toThrow(/already defines.*godot-mcp/i);
 expect(await readFile(file,'utf8')).toBe(existing);
 for(const inline of [
  '[mcp_servers]\ngodot-mcp = { command = "custom" }\n',
  'mcp_servers.godot-mcp.command = "custom"\n'
 ]){
  await writeFile(file,inline);
  await expect(configureClient(options)).rejects.toThrow(/already defines.*godot-mcp/i);
  expect(await readFile(file,'utf8')).toBe(inline);
 }
 const linkedRoot=await tempRoot();
 const linkedConfig=path.join(linkedRoot,'.codex','config.toml');
 const other=path.join(linkedRoot,'other.toml');
 await mkdir(path.dirname(linkedConfig),{recursive:true});
 await writeFile(other,'model = "keep"\n');
 await link(other,linkedConfig);
 await expect(configureClient({...options,projectRoot:linkedRoot,homeDir:linkedRoot})).rejects.toThrow(/single-linked/i);
 expect(await readFile(other,'utf8')).toBe('model = "keep"\n');
});

it('rejects an unknown client before selecting any user configuration path',async()=>{
 const root=await tempRoot();
 expect(()=>clientConfigPath('unknown' as never,root,{env:{},homeDir:root})).toThrow(/Unsupported MCP client/);
 const appData=path.join(root,'AppData');
 const claude=path.join(appData,'Claude','claude_desktop_config.json');
 await mkdir(path.dirname(claude),{recursive:true});
 await writeFile(claude,'{"keep":true}\n');
 await expect(configureClient({client:'unknown' as never,projectRoot:root,toolProfile:'full',
  env:{APPDATA:appData},homeDir:root,platform:'win32'})).rejects.toThrow(/Unsupported MCP client/);
 expect(await readFile(claude,'utf8')).toBe('{"keep":true}\n');
});
