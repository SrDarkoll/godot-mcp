import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {expect,it,vi} from 'vitest';
import {UpgradeJournal} from '../src/upgrade/upgrade-journal.js';

async function fixture(){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mcp-upgrade-journal-')));await fs.writeFile(path.join(root,'project.godot'),'old settings');return root;}

it('keeps backups and compensates configuration plus newly created addon files',async()=>{
 const root=await fixture();const journal=await UpgradeJournal.prepare(root,[{relative:'project.godot',before:Buffer.from('old settings'),after:Buffer.from('new settings')},{relative:'addons/godot_mcp/new.gd',before:null,after:Buffer.from('new addon')}]);
 await journal.publish();expect(await fs.readFile(path.join(root,'project.godot'),'utf8')).toBe('new settings');
 await journal.rollback();expect(await fs.readFile(path.join(root,'project.godot'),'utf8')).toBe('old settings');
 await expect(fs.stat(path.join(root,'addons/godot_mcp/new.gd'))).rejects.toMatchObject({code:'ENOENT'});
 expect(await fs.readFile(path.join(journal.backupPath,'before/project.godot'),'utf8')).toBe('old settings');
});

it('recovers an interrupted publication before the installation can be reused',async()=>{
 const root=await fixture();const journal=await UpgradeJournal.prepare(root,[{relative:'project.godot',before:Buffer.from('old settings'),after:Buffer.from('new settings')}]);
 await journal.publish();expect(await UpgradeJournal.recoverPending(root)).toBe(true);
 expect(await fs.readFile(path.join(root,'project.godot'),'utf8')).toBe('old settings');
 await expect(fs.stat(path.join(root,'.godot-mcp/runtime/recovery.json'))).rejects.toMatchObject({code:'ENOENT'});
 expect((JSON.parse(await fs.readFile(path.join(journal.backupPath,'manifest.json'),'utf8'))).state).toBe('rolled_back');
});

it('retains backups and a recovery marker when an external edit would be overwritten',async()=>{
 const root=await fixture();const journal=await UpgradeJournal.prepare(root,[{relative:'project.godot',before:Buffer.from('old settings'),after:Buffer.from('new settings')}]);
 await journal.publish();await fs.writeFile(path.join(root,'project.godot'),'human edit');
 await expect(journal.rollback()).rejects.toMatchObject({code:'UPGRADE_RECOVERY_REQUIRED'});
 expect(await fs.readFile(path.join(root,'project.godot'),'utf8')).toBe('human edit');
 expect(await fs.readFile(path.join(journal.backupPath,'before/project.godot'),'utf8')).toBe('old settings');
 await fs.stat(path.join(root,'.godot-mcp/runtime/recovery.json'));
});

it('does not adopt another recovery journal or allow unowned paths',async()=>{
 const root=await fixture();await fs.mkdir(path.join(root,'.godot-mcp/runtime'),{recursive:true});
 await fs.writeFile(path.join(root,'.godot-mcp/runtime/recovery.json'),'{}');
 await expect(UpgradeJournal.recoverPending(root)).rejects.toMatchObject({code:'RECOVERY_REQUIRED'});
 expect(await fs.readFile(path.join(root,'.godot-mcp/runtime/recovery.json'),'utf8')).toBe('{}');
 await expect(UpgradeJournal.prepare(root,[{relative:'../escape',before:null,after:Buffer.from('no')}])).rejects.toThrow();
});

it('restores the previous bytes when a file publication fails and commits successful upgrades',async()=>{
 const root=await fixture();const journal=await UpgradeJournal.prepare(root,[{relative:'project.godot',before:Buffer.from('old settings'),after:Buffer.from('new settings')},{relative:'.codex/config.toml',before:null,after:Buffer.from('new config')}]);
 const original=fs.rename;const spy=vi.spyOn(fs,'rename').mockImplementation(async(...args)=>{if(String(args[1]).endsWith('config.toml'))throw new Error('disk failure');return original(...args);});
 try{await expect(journal.publish()).rejects.toThrow('disk failure');}finally{spy.mockRestore();}
 await journal.rollback();expect(await fs.readFile(path.join(root,'project.godot'),'utf8')).toBe('old settings');
 const next=await UpgradeJournal.prepare(root,[{relative:'project.godot',before:Buffer.from('old settings'),after:Buffer.from('verified')}]);
 await next.publish();await next.commit();expect(await UpgradeJournal.recoverPending(root)).toBe(false);
 expect(await fs.readFile(path.join(root,'project.godot'),'utf8')).toBe('verified');
});
