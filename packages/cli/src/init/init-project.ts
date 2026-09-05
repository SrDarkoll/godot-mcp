import { createRequire } from 'node:module';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectRoot } from '@godot-mcp/server/project-root';
import { enablePlugin } from './enable-plugin.js';

export interface InitProjectOptions {
  projectRoot: string;
  godotBin?: string | null;
  enable?: boolean;
}

export interface InitProjectResult {
  projectRoot: string;
  addonPath: string;
  enabled: boolean;
  warnings: string[];
}

function addonTemplateRoot(): string {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve('@godot-mcp/godot-addon/package.json');
  return path.join(path.dirname(packageJson), 'addons', 'godot_mcp');
}

async function readJsonObject(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function ensureProjectGitignore(projectRoot: string): Promise<void> {
  const file = path.join(projectRoot, '.gitignore');
  let current = '';
  try {
    current = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const lines = ['.godot-mcp/runtime/', '.godot-mcp/sessions/'];
  let updated = current;
  if (updated.length > 0 && !updated.endsWith('\n')) updated += '\n';
  for (const line of lines) {
    const existing = new Set(updated.split(/\r?\n/));
    if (!existing.has(line)) updated += `${line}\n`;
  }
  if (updated !== current) await writeFile(file, updated, 'utf8');
}

export async function initProject(options: InitProjectOptions): Promise<InitProjectResult> {
  const projectRoot = await resolveProjectRoot(options.projectRoot);
  const addonPath = path.join(projectRoot, 'addons', 'godot_mcp');
  await mkdir(path.dirname(addonPath), { recursive: true });
  await cp(addonTemplateRoot(), addonPath, { recursive: true, force: true, errorOnExist: false });

  const localRoot = path.join(projectRoot, '.godot-mcp');
  const configPath = path.join(localRoot, 'config.json');
  await mkdir(path.join(localRoot, 'runtime'), { recursive: true });
  await mkdir(path.join(localRoot, 'sessions'), { recursive: true });
  const config = await readJsonObject(configPath);
  config.protocol = 1;
  config.bridgePort = 61337;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await ensureProjectGitignore(projectRoot);

  const warnings: string[] = [];
  let enabled = false;
  if (options.enable !== false) {
    if (options.godotBin) {
      await enablePlugin(projectRoot, options.godotBin);
      enabled = true;
    } else {
      warnings.push('Godot executable is not configured; enable godot_mcp in Project Settings > Plugins.');
    }
  }

  return { projectRoot, addonPath, enabled, warnings };
}
