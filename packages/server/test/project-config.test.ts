import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it} from 'vitest';
import {readProjectConfig,writeProjectConfig,repairProjectConfig} from '../src/project/project-config.js';
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
it('repairs invalid known settings while retaining unknown keys and exact original bytes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-config-repair-'));
 await fs.mkdir(path.join(root,'.godot-mcp'));
 const original='{ "protocol": 7, "bridgePort": "bad", "godotBin": "C:/Godot.exe", "custom": {"keep": true} }\r\n';
 await fs.writeFile(path.join(root,'.godot-mcp/config.json'),original);
 const result=await repairProjectConfig(root,{bridgePort:12345});
 expect(result.config).toMatchObject({protocol:1,bridgePort:12345,godotBin:'C:/Godot.exe',toolProfile:'full',custom:{keep:true}});
 expect(await fs.readFile(result.backupPath!,'utf8')).toBe(original);
 expect(await readProjectConfig(root)).toEqual(result.config);
});
it('refuses repair through a linked backup directory without changing the configuration',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-config-backup-'));
 const outside=await fs.mkdtemp(path.join(os.tmpdir(),'godot-config-backup-outside-'));
 await fs.mkdir(path.join(root,'.godot-mcp'));await fs.writeFile(path.join(root,'.godot-mcp/config.json'),'{broken');
 await fs.symlink(outside,path.join(root,'.godot-mcp/config-backups'),'junction');
 await expect(repairProjectConfig(root,{})).rejects.toThrow();
 expect(await fs.readFile(path.join(root,'.godot-mcp/config.json'),'utf8')).toBe('{broken');
 expect(await fs.readdir(outside)).toEqual([]);
});
