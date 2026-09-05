#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { doctor } from './doctor/doctor.js';
import { initProject } from './init/init-project.js';

interface ParsedCommand {
  command: 'init' | 'doctor';
  projectRoot: string;
  godotBin: string | null;
}

function usage(): string {
  return [
    'Usage:',
    '  godot-mcp init [path] [--godot <exe>]',
    '  godot-mcp doctor [path] [--godot <exe>]'
  ].join('\n');
}

export function parseCliArgs(argv: string[]): ParsedCommand {
  const command = argv[0];
  if (command !== 'init' && command !== 'doctor') throw new Error(`Unknown command: ${command ?? ''}`);
  let projectRoot = process.cwd();
  let godotBin: string | null = null;
  let positionalSeen = false;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--godot') {
      const value = argv[++i];
      if (!value) throw new Error('--godot requires an executable path');
      godotBin = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!positionalSeen) {
      projectRoot = arg;
      positionalSeen = true;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return { command, projectRoot, godotBin };
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  let parsed: ParsedCommand;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    return 2;
  }

  if (parsed.command === 'init') {
    const result = await initProject({ projectRoot: parsed.projectRoot, godotBin: parsed.godotBin, enable: true });
    console.log(`Initialized Godot MCP in ${result.projectRoot}`);
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
    return 0;
  }

  const report = await doctor({ projectRoot: parsed.projectRoot, godotBin: parsed.godotBin });
  for (const check of report.checks) console.log(`${check.ok ? '✓' : '✗'} ${check.id}: ${check.detail}`);
  return report.ok ? 0 : 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void runCli().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
