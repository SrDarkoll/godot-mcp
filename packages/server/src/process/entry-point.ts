import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Node resolves module URLs through links but retains the launch path in argv. */
export function isMainModule(moduleUrl: string, entry = process.argv[1]): boolean {
  if (!entry) return false;
  try {
    const modulePath = realpathSync(fileURLToPath(moduleUrl));
    const entryPath = realpathSync(entry);
    return process.platform === 'win32' ? modulePath.toLowerCase() === entryPath.toLowerCase() : modulePath === entryPath;
  } catch { return false; }
}
