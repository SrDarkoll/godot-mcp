import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ClientLaunchEntry } from './client-config.js';
import {managedCodexLaunchMatches,hasCodexServer} from './codex-upgrade.js';

export const BEGIN = '# godot-mcp: begin managed Codex MCP server';
export const END = '# godot-mcp: end managed Codex MCP server';
const SERVER_TABLE = '[mcp_servers.godot-mcp]';
const MAX_CONFIG_BYTES = 1024 * 1024;
const EXISTING_SERVER = /^\s*\[\[?\s*mcp_servers\s*\.\s*(?:godot-mcp|"godot-mcp"|'godot-mcp')(?:\s*\.|\s*\])/m;
const DOTTED_SERVER = /^\s*mcp_servers\s*\.\s*(?:godot-mcp|"godot-mcp"|'godot-mcp')\s*(?:\.|=)/m;
const SERVERS_TABLE = /^\s*\[\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\](?:\s*#.*)?\s*$/;
const INLINE_SERVER = /^\s*(?:godot-mcp|"godot-mcp"|'godot-mcp')\s*=/;

function definesGodotServer(text: string): boolean {
  if (EXISTING_SERVER.test(text) || DOTTED_SERVER.test(text)) return true;
  let inServersTable = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) inServersTable = SERVERS_TABLE.test(line);
    else if (inServersTable && INLINE_SERVER.test(line)) return true;
  }
  return false;
}

export function renderCodexServer(entry: ClientLaunchEntry): string {
  return `${SERVER_TABLE}\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\n`;
}

function managedBlock(entry: ClientLaunchEntry): string {
  return `${BEGIN}\n${renderCodexServer(entry)}${END}`;
}

function backupStamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

export async function readCodexConfig(file: string): Promise<string | null> {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_CONFIG_BYTES) {
      throw new Error('Codex config must be an ordinary single-linked file under 1 MiB');
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file));
    if (text.includes('\0')) throw new Error('Codex config contains NUL bytes');
    return text;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function inspectManagedCodexConfig(file: string, entry: ClientLaunchEntry): Promise<boolean | null> {
  const text = await readCodexConfig(file);
  if (text === null) return null;
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (begin < 0 && end < 0) return null;
  return begin >= 0 && end > begin &&
    begin === text.lastIndexOf(BEGIN) && end === text.lastIndexOf(END) &&
    await managedCodexLaunchMatches(text,entry) &&
    !hasCodexServer(text.slice(0, begin) + text.slice(end + END.length));
}

export async function configureCodexConfig(
  file: string,
  entry: ClientLaunchEntry,
  now: () => Date = () => new Date()
): Promise<{ changed: boolean; backupPath?: string }> {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true });
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('Codex config directory must be an ordinary directory');
  }

  const current = await readCodexConfig(file);

  const block = managedBlock(entry);
  let updated: string;
  if (current === null) {
    updated = `${block}\n`;
  } else {
    const begin = current.indexOf(BEGIN);
    const end = current.indexOf(END);
    if ((begin < 0) !== (end < 0) ||
        (begin >= 0 && (begin !== current.lastIndexOf(BEGIN) || end !== current.lastIndexOf(END) || end < begin))) {
      throw new Error('Codex config has incomplete or duplicate godot-mcp markers');
    }
    const unmanaged = begin < 0 ? current : current.slice(0, begin) + current.slice(end + END.length);
    if (definesGodotServer(unmanaged)) {
      throw new Error('Codex config already defines an unmanaged godot-mcp server');
    }
    updated = begin >= 0
      ? current.slice(0, begin) + block + current.slice(end + END.length)
      : `${current}${current.endsWith('\n') ? '' : '\n'}\n${block}\n`;
    if (updated === current) return { changed: false };
  }

  let backupPath: string | undefined;
  if (current !== null) {
    backupPath = `${file}.godot-mcp-${backupStamp(now())}.bak`;
    await copyFile(file, backupPath, constants.COPYFILE_EXCL);
  }
  await writeFile(file, updated, { encoding: 'utf8', flag: current === null ? 'wx' : 'w' });
  return { changed: true, ...(backupPath ? { backupPath } : {}) };
}
