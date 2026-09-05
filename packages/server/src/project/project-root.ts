import { access, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

function pathApiFor(...values: string[]): typeof path {
  return values.some(value => path.win32.isAbsolute(value)) ? path.win32 as typeof path : path;
}

export async function resolveProjectRoot(input = process.cwd()): Promise<string> {
  const initial = await realpath(path.resolve(input));
  let current = initial;
  const initialStat = await stat(initial);
  if (initialStat.isFile()) current = path.dirname(initial);

  while (true) {
    try {
      await access(path.join(current, 'project.godot'));
      return await realpath(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  throw new Error(`No Godot project found from ${input}`);
}

export function assertProjectPath(projectRoot: string, target: string): string {
  const api = pathApiFor(projectRoot, target);
  const root = api.resolve(projectRoot);
  const resolved = api.resolve(target);
  const relative = api.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${api.sep}`) || api.isAbsolute(relative)) {
    throw new Error(`Target is outside project scope: ${resolved}`);
  }
  return resolved;
}
