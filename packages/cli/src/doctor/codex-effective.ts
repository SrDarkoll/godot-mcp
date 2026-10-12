import { access, readFile, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runCommand } from '../process/run-command.js';
import {normalizeCodexLaunch} from '../setup/codex-launch.js';
import type {ToolProfile} from '@godot-mcp/protocol';

export interface CodexInvocation { executable: string; prefix?: string[]; }
export interface CodexEffectiveOptions { projectRoot: string; cwd: string; toolProfile?:ToolProfile; env?: NodeJS.ProcessEnv; command?: CodexInvocation; }
export interface CodexEffectiveReport { available: boolean; matches: boolean; detail: string; duplicateServers: string[]; }
async function exists(file: string): Promise<boolean> { try { await access(file); return true; } catch { return false; } }

async function invocation(env: NodeJS.ProcessEnv): Promise<CodexInvocation | null> {
  if (env.GODOT_MCP_CODEX_BIN && path.isAbsolute(env.GODOT_MCP_CODEX_BIN) && await exists(env.GODOT_MCP_CODEX_BIN)) return { executable: env.GODOT_MCP_CODEX_BIN };
  for (const directory of (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(path.isAbsolute)) {
    const direct = path.join(directory, process.platform === 'win32' ? 'codex.exe' : 'codex');
    if (await exists(direct)) return { executable: direct };
    if (process.platform !== 'win32' || !await exists(path.join(directory, 'codex.cmd'))) continue;
    const packageRoot = path.join(directory, 'node_modules/@openai/codex');
    const script = path.join(packageRoot, 'bin/codex.js');
    try {
      const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
      if (manifest.name !== '@openai/codex') return null;
      const platformPackage = `@openai/codex-win32-${process.arch}`;
      const target = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
      let vendor = path.join(packageRoot, 'vendor');
      try { vendor = path.join(path.dirname(createRequire(script).resolve(`${platformPackage}/package.json`)), 'vendor'); } catch {}
      const binary = path.join(vendor, target, 'bin/codex.exe');
      if (await exists(binary)) return { executable: binary };
      return null;
    } catch { return null; }
  }
  return null;
}

function target(entry: any): string | null {
  const transport = entry?.transport;
  if (transport?.type !== 'stdio' || !Array.isArray(transport.args) || transport.args.some((arg: unknown) => typeof arg !== 'string')) return null;
  const args: string[] = transport.args;
  const command = path.basename(String(transport.command).replaceAll('\\', '/')).toLowerCase();
  const npm = ['npx', 'npx.cmd', 'npx.exe'].includes(command) && args.some(arg => /^@srdarkx\/godot-mcp(?:@|$)/.test(arg));
  const node = ['node', 'node.exe'].includes(command) && args.some(arg => /[\\/]dist[\\/]index\.js$/.test(arg));
  if (!npm && !node) return null;
  const flag = args.findIndex(arg => arg === '--project' || arg === '-p');
  if (flag >= 0) return args[flag + 1] ?? null;
  const start = args.findIndex(arg => arg === 'start' || arg === 'run');
  return start >= 0 && !args[start + 1]?.startsWith('-') ? args[start + 1] ?? null : null;
}

export async function inspectEffectiveCodex(options: CodexEffectiveOptions): Promise<CodexEffectiveReport> {
  const env = options.env ?? process.env;
  const command = options.command ?? await invocation(env);
  if (!command) return { available: false, matches: false, duplicateServers: [], detail: 'Codex CLI unavailable; effective client selection was not verified' };
  try {
    let cwd = await realpath(path.resolve(options.cwd));
    if ((await stat(cwd)).isFile()) cwd = path.dirname(cwd);
    const result = await runCommand(command.executable, [...(command.prefix ?? []), 'mcp', 'list', '--json'], { cwd, env, timeoutMs: 5000, maxOutputBytes: 1024 * 1024 });
    if (result.code !== 0) throw new Error('query failed');
    const servers: unknown = JSON.parse(result.stdout);
    if (!Array.isArray(servers) || servers.length > 256) throw new Error('unsupported result');
    const expected = await realpath(options.projectRoot);
    const equal = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
    const matching: string[] = [];
    let canonicalMatch = false;
    let canonicalTarget: string | null = null;
    for (const server of servers) {
      const project = target(server);
      if (server?.name === 'godot-mcp') canonicalTarget = project;
      if (!project || server?.enabled !== true) continue;
      try {
        const actual = await realpath(path.resolve(server.transport.cwd ?? cwd, project));
        if (equal(actual, expected)) {
          const normalized=await normalizeCodexLaunch({command:server.transport.command,args:server.transport.args},options.projectRoot);
          matching.push(String(server.name));
          if (server.name === 'godot-mcp') canonicalMatch = (normalized.profile??'full')===(options.toolProfile??'full');
        }
      } catch {}
    }
    const duplicateServers = matching.length > 1 ? matching : [];
    const matches = canonicalMatch && duplicateServers.length === 0;
    const detail = duplicateServers.length ? `Multiple enabled Codex servers target this project: ${duplicateServers.join(', ')}. Disable the redundant project-local alias before reconnecting.` :
      matches ? `Effective Codex server matches this project from ${cwd}` :
      `Effective Codex server does not select this project from ${cwd}${canonicalTarget ? `; selected target: ${canonicalTarget}` : ''}. For a trusted Godot project without Git, run: npx --yes @srdarkx/godot-mcp@latest setup codex . --register-project-root. Run Codex from the project root until root discovery is configured.`;
    return { available: true, matches, duplicateServers, detail };
  } catch { return { available: true, matches: false, duplicateServers: [], detail: 'Codex effective configuration could not be read. Check its configuration and trust from the Godot project root; client readiness is unverified.' }; }
}
