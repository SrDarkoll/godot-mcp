import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';
import { readCodexConfig } from './codex-config.js';

export interface CodexRootOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  beforeWrite?: () => Promise<void>;
}
export interface CodexRootRegistration {
  path: string;
  changed: boolean;
  markers: string[];
  backupPath?: string;
}
const fail = (message: string, code = 'CODEX_ROOT_CONFIG_INVALID') => Object.assign(new Error(message), { code });

export function codexUserConfigPath(options: CodexRootOptions = {}): string {
  const base = (options.env ?? process.env).CODEX_HOME ?? path.join(options.homeDir ?? os.homedir(), '.codex');
  if (!path.isAbsolute(base)) throw fail('CODEX_HOME must be an absolute directory; no configuration was changed');
  return path.join(base, 'config.toml');
}

function config(text: string): Record<string, unknown> {
  try { return parse(text); }
  catch { throw fail('Codex user config is invalid TOML; no configuration was changed'); }
}

/** Find root statements without treating comments or multiline strings as keys/tables. */
function arrayEnd(text: string): { end: number; last: string } | null {
  let i = 0;
  while (i < text.length) {
    while (/\s/.test(text[i] ?? '') && i < text.length) i++;
    if (text[i] === '#') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (i === text.length || text[i] === '[') return null;
    const start = i;
    let quote = ''; let triple = false; let depth = 0; let last = '';
    const key = /^(?:project_root_markers|"project_root_markers"|'project_root_markers')\s*=\s*/.exec(text.slice(start));
    const target = !!key;
    for (; i < text.length; i++) {
      const ch = text[i]!;
      if (quote) {
        if (quote === '"' && ch === '\\') { i++; continue; }
        if (triple ? text.slice(i, i + 3) === quote.repeat(3) : ch === quote) {
          if (triple) i += 2;
          quote = ''; triple = false; last = ch;
        }
        continue;
      }
      if (ch === '#') { while (i < text.length && text[i] !== '\n') i++; if (!depth) break; continue; }
      if (ch === '"' || ch === "'") {
        quote = ch; triple = text.slice(i, i + 3) === ch.repeat(3); if (triple) i += 2; continue;
      }
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') {
        depth--;
        if (target && depth === 0 && ch === ']') return { end: i, last };
      }
      if (ch === '\n' && depth === 0) break;
      if (!/\s/.test(ch)) last = ch;
    }
    i++;
  }
  return null;
}

export function addGodotRootMarker(text: string): { text: string; markers: string[] } {
  const parsed = config(text);
  const existing = parsed.project_root_markers;
  if (existing !== undefined && (!Array.isArray(existing) || existing.some(value => typeof value !== 'string'))) {
    throw fail('Codex project_root_markers must be an array of strings; no configuration was changed');
  }
  const markers = existing === undefined ? ['.git'] : existing as string[];
  if (markers.includes('project.godot')) return { text, markers: [...markers] };
  const next = [...markers, 'project.godot'];
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  let updated: string;
  if (existing === undefined) updated = `project_root_markers = ${JSON.stringify(next)}${newline}${text}`;
  else {
    const location = arrayEnd(text);
    if (!location) throw fail('Unable to locate Codex root markers safely; no configuration was changed');
    const addition = `${markers.length && location.last !== ',' ? ', ' : ''}"project.godot"`;
    updated = text.slice(0, location.end) + addition + text.slice(location.end);
  }
  if (JSON.stringify(config(updated).project_root_markers) !== JSON.stringify(next)) throw fail('Codex root marker update could not be verified; no configuration was changed');
  return { text: updated, markers: next };
}

export async function registerCodexProjectRoot(options: CodexRootOptions = {}): Promise<CodexRootRegistration> {
  const file = codexUserConfigPath(options);
  const current = await readCodexConfig(file);
  const original = current === null ? null : await readFile(file);
  const updated = addGodotRootMarker(current ?? '');
  if (current === updated.text) return { path: file, changed: false, markers: updated.markers };
  await mkdir(path.dirname(file), { recursive: true });
  const directory = await lstat(path.dirname(file));
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw fail('Codex user directory must be an ordinary directory; no configuration was changed');
  const temporary = `${file}.godot-mcp-roots-${randomUUID()}.tmp`;
  let backupPath: string | undefined;
  try {
    const bom = original?.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? '\ufeff' : '';
    await writeFile(temporary, bom + updated.text, { flag: 'wx', mode: 0o600 });
    await options.beforeWrite?.();
    const fresh = await readCodexConfig(file);
    const freshBytes = fresh === null ? null : await readFile(file);
    if (fresh !== current || (original !== null && (!freshBytes || !original.equals(freshBytes)))) throw fail('Codex user config changed during setup; the new edit was preserved', 'CODEX_CONFIG_CHANGED');
    if (original !== null) {
      backupPath = `${file}.godot-mcp-roots-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.bak`;
      await copyFile(file, backupPath, constants.COPYFILE_EXCL);
    }
    if (current === null) {
      await copyFile(temporary, file, constants.COPYFILE_EXCL);
    } else await rename(temporary, file);
    return { path: file, changed: true, markers: updated.markers, ...(backupPath ? { backupPath } : {}) };
  } finally { await rm(temporary, { force: true }).catch(() => {}); }
}
