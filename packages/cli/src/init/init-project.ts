import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectRoot } from '@godot-mcp/server/project-root';
import { enablePlugin } from './enable-plugin.js';
import { readProjectConfig, writeProjectConfig, ensureProjectDirectory } from '@godot-mcp/server/project-config';
import { serverStatus } from '@godot-mcp/server/management';
import { installAddon } from './install-addon.js';
import { ProjectLease, requireNoRecoveryJournal } from '@godot-mcp/server/project-lease';

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
  backupPath?: string;
}

function addonTemplateRoot(): string {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve('@godot-mcp/godot-addon/package.json');
  return path.join(path.dirname(packageJson), 'addons', 'godot_mcp');
}

async function readJsonObject(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
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

  const lines = [
    '.godot-mcp/runtime/',
    '.godot-mcp/sessions/',
    '.godot-mcp/generated/',
    '.godot-mcp/config.json',
    '.godot-mcp/addon-backups/'
  ];
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
  const lease = await ProjectLease.acquire(projectRoot);
  try {
    return await initOwnedProject(projectRoot, options);
  } finally {
    await lease.release();
  }
}

async function initOwnedProject(projectRoot: string, options: InitProjectOptions): Promise<InitProjectResult> {
  await requireNoRecoveryJournal(projectRoot);
  const warnings: string[] = [];
  const status = await serverStatus(projectRoot).catch(() => {
    warnings.push('Previous bridge descriptor could not be contacted; exclusive project maintenance acquired.');
    return null;
  });
  if (status && status.state !== 'offline') {
    throw Object.assign(new Error('Stop the running MCP server before updating the addon'), { code: 'PROJECT_BUSY' });
  }
  const config = await readProjectConfig(projectRoot);
  const godotBin = options.godotBin ?? config.godotBin;
  const addonPath = path.join(projectRoot, 'addons', 'godot_mcp');
  const backupPath = await installAddon(projectRoot, addonTemplateRoot());
  await ensureProjectDirectory(projectRoot, ['.godot-mcp', 'runtime']);
  await ensureProjectDirectory(projectRoot, ['.godot-mcp', 'sessions']);
  await writeProjectConfig(projectRoot, { godotBin });
  await ensureProjectGitignore(projectRoot);

  let enabled = false;
  if (options.enable !== false) {
    if (godotBin) {
      await enablePlugin(projectRoot, godotBin);
      enabled = true;
    } else {
      warnings.push('Godot executable is not configured; enable godot_mcp in Project Settings > Plugins.');
    }
  }

  return { projectRoot, addonPath, enabled, warnings, ...(backupPath ? { backupPath } : {}) };
}
