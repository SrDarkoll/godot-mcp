import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export interface AddonIntegrity { ok: boolean; filesChecked: number; issues: Array<{ path: string; reason: string }>; }
export async function inspectAddonIntegrity(projectRoot: string): Promise<AddonIntegrity> {
  const result: AddonIntegrity = { ok: true, filesChecked: 0, issues: [] };
  const packageFile = createRequire(import.meta.url).resolve('@godot-mcp/godot-addon/package.json');
  const template = path.join(path.dirname(packageFile), 'addons/godot_mcp');
  const target = path.join(projectRoot, 'addons/godot_mcp');
  try{
    const parent=await lstat(path.join(projectRoot,'addons'));
    if(!parent.isDirectory()||parent.isSymbolicLink())throw new Error('unsafe');
  }catch{return {ok:false,filesChecked:0,issues:[{path:'addons',reason:'missing or linked directory'}]};}
  const visit = async (relative: string): Promise<void> => {
    const destination = path.join(target, relative);
    try {
      const directory = await lstat(destination);
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('unsafe');
    } catch { result.issues.push({ path: relative || 'addons/godot_mcp', reason: 'missing or linked directory' }); return; }
    for (const entry of await readdir(path.join(template, relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) { await visit(name); continue; }
      if (!entry.isFile()) continue;
      result.filesChecked++;
      try {
        const file = path.join(target, name);
        const info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 16 * 1024 * 1024) throw new Error('unsafe');
        const expected = createHash('sha256').update(await readFile(path.join(template, name))).digest('hex');
        const actual = createHash('sha256').update(await readFile(file)).digest('hex');
        if (expected !== actual) result.issues.push({ path: name, reason: 'differs from bundled addon' });
      } catch { result.issues.push({ path: name, reason: 'missing or unsafe file' }); }
    }
  };
  await visit('');
  result.ok = result.issues.length === 0;
  return result;
}
