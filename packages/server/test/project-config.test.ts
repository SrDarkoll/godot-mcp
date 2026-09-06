import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it} from 'vitest';
import {readProjectConfig,writeProjectConfig} from '../src/project/project-config.js';
it('defaults config, preserves custom keys and persists explicit settings',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-config-'));
 expect(await readProjectConfig(root)).toMatchObject({protocol:1,bridgePort:61337,godotBin:null,toolProfile:'full'});
 await fs.mkdir(path.join(root,'.godot-mcp'));await fs.writeFile(path.join(root,'.godot-mcp/config.json'),JSON.stringify({custom:true,bridgePort:9999}));
 await writeProjectConfig(root,{godotBin:'C:/Tools/Godot.exe',toolProfile:'3d'});
 expect(await readProjectConfig(root)).toMatchObject({custom:true,bridgePort:9999,godotBin:'C:/Tools/Godot.exe',toolProfile:'3d'});
 await expect(writeProjectConfig(root,{toolProfile:'physics' as never})).rejects.toThrow();
 await expect(writeProjectConfig(root,{bridgePort:70000})).rejects.toThrow();
 expect((await readProjectConfig(root)).bridgePort).toBe(9999);
});
it('refuses linked local config before writing outside the project',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-config-link-'));const outside=await fs.mkdtemp(path.join(os.tmpdir(),'godot-config-outside-'));
 await fs.symlink(outside,path.join(root,'.godot-mcp'),'junction');
 await expect(writeProjectConfig(root,{bridgePort:1234})).rejects.toThrow();expect(await fs.readdir(outside)).toEqual([]);
});
