import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it,vi} from 'vitest';
import {snapshotProject} from '../src/project/project-snapshot.js';
it('excludes live MCP metadata and refuses oversized or linked project inputs',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-validation-source-'));
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'godot-validation-copy-'));
 await fs.writeFile(path.join(root,'project.godot'),'config_version=5\n');
 await fs.mkdir(path.join(root,'.godot-mcp'));await fs.writeFile(path.join(root,'.godot-mcp/secret'),'do not copy');
 expect((await snapshotProject(root,output,1024,Date.now()+5000)).files.map(f=>f.path)).toEqual(['res://project.godot']);
 await fs.writeFile(path.join(root,'large.bin'),Buffer.alloc(2048));
 await expect(snapshotProject(root,output,1024,Date.now()+5000)).rejects.toMatchObject({code:'VALIDATION_LIMIT'});
 const other=await fs.mkdtemp(path.join(os.tmpdir(),'godot-validation-outside-'));
 await fs.symlink(other,path.join(root,'linked'),'junction');
 await expect(snapshotProject(root,output,1024*1024,Date.now()+5000)).rejects.toMatchObject({code:'UNSAFE_PROJECT_PATH'});
});
it('detects an ordinary external source edit during snapshot creation',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-validation-race-'));
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'godot-validation-race-copy-'));
 await fs.writeFile(path.join(root,'main.gd'),'extends Node\n');
 const copy=fs.copyFile;
 const spy=vi.spyOn(fs,'copyFile').mockImplementation(async(...args)=>{await copy(...args);await fs.writeFile(args[0],'changed while copying');});
 try{await expect(snapshotProject(root,output,1024,Date.now()+5000)).rejects.toMatchObject({code:'PROJECT_CHANGED'});}finally{spy.mockRestore();}
});
