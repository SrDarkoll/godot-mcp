import fs from 'node:fs/promises';
import path from 'node:path';
import { AddonJournal } from './addon-journal.js';
import { ensureProjectDirectory } from '@godot-mcp/server/project-config';

async function walk(root: string, relative = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const value = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Addon template cannot contain links');
    if (entry.isDirectory()) files.push(...(await walk(root, value)));
    else if (entry.isFile()) files.push(value);
  }
  return files;
}

export async function installAddon(root: string, template: string): Promise<string | undefined> {
  await AddonJournal.recoverPending(root);
  const target = await ensureProjectDirectory(root, ['addons', 'godot_mcp']);
  const entries: Array<{ relative: string; destination: string; before: Buffer | null; after: Buffer }> = [];
  for (const relative of await walk(template)) {
    const destination = path.join(target, relative);
    await ensureProjectDirectory(root, ['addons', 'godot_mcp', ...relative.split(path.sep).slice(0, -1)]);
    let before: Buffer | null = null;
    try {
      const stat = await fs.lstat(destination);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || stat.size > 16 * 1024 * 1024) {
        throw new Error('Unsafe addon destination');
      }
      before = await fs.readFile(destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const after = await fs.readFile(path.join(template, relative));
    if (before === null || !before.equals(after)) entries.push({ relative, destination, before, after });
  }
  if (!entries.length) return undefined;
  const readVersion = async (file: string) => {
    try {
      return (await fs.readFile(file, 'utf8')).match(/version\s*=\s*"([^"]+)"/)?.[1] ?? null;
    } catch {
      return null;
    }
  };
  const journal = await AddonJournal.prepare(
    root,
    entries.map((entry) => ({ ...entry, relative: entry.relative.split(path.sep).join('/') })),
    await readVersion(path.join(target, 'plugin.cfg')),
    await readVersion(path.join(template, 'plugin.cfg'))
  );
  try {
    await journal.publish();
  } catch (error) {
    try {
      await journal.rollback();
    } catch {
      throw Object.assign(new Error('Addon update requires recovery; backups and journal retained'), {
        code: 'ADDON_RECOVERY_REQUIRED'
      });
    }
    throw error;
  }
  return journal.backupPath;
}
