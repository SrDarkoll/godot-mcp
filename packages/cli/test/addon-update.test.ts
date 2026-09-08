import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, it, vi } from 'vitest';
import { installAddon } from '../src/init/install-addon.js';
import { AddonJournal } from '../src/init/addon-journal.js';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

it('restores already replaced files when a later addon file cannot be published', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'addon-update-'));
  const template = await fs.mkdtemp(path.join(os.tmpdir(), 'addon-template-'));
  const target = path.join(root, 'addons/godot_mcp');
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(path.join(target, 'a.gd'), 'old a');
  await fs.writeFile(path.join(target, 'b.gd'), 'old b');
  await fs.writeFile(path.join(template, 'a.gd'), 'new a');
  await fs.writeFile(path.join(template, 'b.gd'), 'new b');

  const rename = fs.rename;
  let failed = false;
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (...args) => {
    if (String(args[1]) === path.join(target, 'b.gd') && !failed) {
      failed = true;
      throw new Error('Injected disk failure');
    }
    return rename(...args);
  });

  try {
    await expect(installAddon(root, template)).rejects.toThrow();
  } finally {
    spy.mockRestore();
  }

  expect(await fs.readFile(path.join(target, 'a.gd'), 'utf8')).toBe('old a');
  expect(await fs.readFile(path.join(target, 'b.gd'), 'utf8')).toBe('old b');
  await expect(fs.stat(path.join(root, '.godot-mcp/runtime/addon-update.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('resumes compensation from a retained journal including files created by the interrupted update', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'addon-resume-'));
  const target = path.join(root, 'addons/godot_mcp');
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(path.join(target, 'a.gd'), 'old a');
  const journal = await AddonJournal.prepare(
    root,
    [
      { relative: 'a.gd', before: Buffer.from('old a'), after: Buffer.from('new a') },
      { relative: 'new.gd', before: null, after: Buffer.from('new file') },
    ],
    '0.1',
    '0.2'
  );

  // Simulated process loss after two file publications, before committed state.
  await fs.writeFile(path.join(target, 'a.gd'), 'new a');
  await fs.writeFile(path.join(target, 'new.gd'), 'new file');
  await AddonJournal.recoverPending(root);
  expect(await fs.readFile(path.join(target, 'a.gd'), 'utf8')).toBe('old a');
  await expect(fs.stat(path.join(target, 'new.gd'))).rejects.toMatchObject({ code: 'ENOENT' });
  const record = JSON.parse(await fs.readFile(path.join(journal.backupPath, 'manifest.json'), 'utf8'));
  expect(record).toMatchObject({ state: 'rolled_back', fromVersion: '0.1', toVersion: '0.2' });
  expect(record.entries).toHaveLength(2);
  expect(await fs.readFile(path.join(journal.backupPath, 'after/new.gd'), 'utf8')).toBe('new file');
});

it('retains journal and all backups when an external edit conflicts with addon compensation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'addon-conflict-'));
  const target = path.join(root, 'addons/godot_mcp');
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(path.join(target, 'a.gd'), 'old');
  const journal = await AddonJournal.prepare(
    root,
    [{ relative: 'a.gd', before: Buffer.from('old'), after: Buffer.from('new') }],
    null,
    null
  );
  await fs.writeFile(path.join(target, 'a.gd'), 'human');
  await expect(AddonJournal.recoverPending(root)).rejects.toMatchObject({ code: 'ADDON_RECOVERY_REQUIRED' });
  expect(await fs.readFile(path.join(target, 'a.gd'), 'utf8')).toBe('human');
  expect(await fs.readFile(path.join(journal.backupPath, 'files/a.gd'), 'utf8')).toBe('old');
  expect(JSON.parse(await fs.readFile(path.join(root, '.godot-mcp/runtime/addon-update.json'), 'utf8'))).toHaveProperty('id');
});

it('recovers after the updater process is killed after publishing a newly created file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'addon-killed-'));
  const target = path.join(root, 'addons/godot_mcp');
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(path.join(target, 'a.gd'), 'old');
  const module = pathToFileURL(path.resolve(import.meta.dirname, '../dist/init/addon-journal.js')).href;
  const source = `import fs from 'node:fs/promises'; import {AddonJournal} from ${JSON.stringify(module)};
  const root=process.argv[1];
  const journal=await AddonJournal.prepare(root,[{relative:'a.gd',before:Buffer.from('old'),after:Buffer.from('new')},{relative:'b.gd',before:null,after:Buffer.from('created')}],null,null);
  const rename=fs.rename;
  fs.rename=async(...args)=>{await rename(...args);if(String(args[1]).endsWith('b.gd')){process.send('published');await new Promise(()=>{});}};
  process.stdin.resume();await journal.publish();`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, root], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  try {
    expect((await once(child, 'message'))[0]).toBe('published');
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    expect(await fs.readFile(path.join(target, 'b.gd'), 'utf8')).toBe('created');
    await AddonJournal.recoverPending(root);
    expect(await fs.readFile(path.join(target, 'a.gd'), 'utf8')).toBe('old');
    await expect(fs.stat(path.join(target, 'b.gd'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}, 10000);
