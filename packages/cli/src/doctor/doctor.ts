import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { resolveProjectRoot } from '@godot-mcp/server/project-root';

export type DoctorCheckId = 'node' | 'project' | 'addon' | 'godot' | 'protocol';
export interface DoctorCheck { id: DoctorCheckId; ok: boolean; detail: string; }
export interface DoctorReport { ok: boolean; checks: DoctorCheck[]; }
export interface DoctorOptions { projectRoot: string; godotBin?: string | null; }

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

async function godotVersion(bin: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, ['--version'], { windowsHide: true });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(`exit ${code ?? 'unknown'}`)));
  });
}

export async function doctor(options: DoctorOptions): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({ id: 'node', ok: nodeMajor >= 22, detail: `Node ${process.versions.node} (requires >=22)` });

  let projectRoot: string | null = null;
  try {
    projectRoot = await resolveProjectRoot(options.projectRoot);
    checks.push({ id: 'project', ok: true, detail: path.join(projectRoot, 'project.godot') });
  } catch (error) {
    checks.push({ id: 'project', ok: false, detail: error instanceof Error ? error.message : String(error) });
  }

  if (projectRoot) {
    const cfg = path.join(projectRoot, 'addons', 'godot_mcp', 'plugin.cfg');
    const gd = path.join(projectRoot, 'addons', 'godot_mcp', 'plugin.gd');
    const addonOk = await exists(cfg) && await exists(gd);
    checks.push({ id: 'addon', ok: addonOk, detail: addonOk ? 'Godot MCP addon installed' : 'Missing addons/godot_mcp/plugin.cfg or plugin.gd' });

    const configPath = path.join(projectRoot, '.godot-mcp', 'config.json');
    if (await exists(configPath)) {
      try {
        const config = JSON.parse(await readFile(configPath, 'utf8'));
        const ok = config?.protocol === 1;
        checks.push({ id: 'protocol', ok, detail: ok ? 'Protocol 1' : `Expected protocol 1, found ${String(config?.protocol)}` });
      } catch (error) {
        checks.push({ id: 'protocol', ok: false, detail: `Invalid config.json: ${error instanceof Error ? error.message : String(error)}` });
      }
    } else {
      checks.push({ id: 'protocol', ok: false, detail: 'Missing .godot-mcp/config.json' });
    }
  } else {
    checks.push({ id: 'addon', ok: false, detail: 'Project unavailable' });
    checks.push({ id: 'protocol', ok: false, detail: 'Project unavailable' });
  }

  if (!options.godotBin) {
    checks.push({ id: 'godot', ok: false, detail: 'Godot executable not configured' });
  } else if (!await exists(options.godotBin)) {
    checks.push({ id: 'godot', ok: false, detail: `Godot executable not found: ${options.godotBin}` });
  } else {
    try {
      const version = await godotVersion(options.godotBin);
      checks.push({ id: 'godot', ok: version.startsWith('4.'), detail: version || 'No version output' });
    } catch (error) {
      checks.push({ id: 'godot', ok: false, detail: `Unable to run Godot: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  return { ok: checks.every(check => check.ok), checks };
}
