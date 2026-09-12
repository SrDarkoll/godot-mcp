import { access, readFile } from 'node:fs/promises';
import {runCommand} from '../process/run-command.js';
import path from 'node:path';
import { resolveProjectRoot } from '@godot-mcp/server/project-root';
import {serverStatus} from '@godot-mcp/server/management';
import {readProjectConfig} from '@godot-mcp/server/project-config';

export type DoctorCheckId = 'node' | 'project' | 'addon' | 'godot' | 'protocol' | 'runtime' | 'bridge' | 'runtimeConnection';
export interface DoctorCheck { id: DoctorCheckId; ok: boolean; detail: string; required?:boolean; }
export interface DoctorReport { ok: boolean; checks: DoctorCheck[]; }
export interface DoctorOptions { projectRoot: string; godotBin?: string | null; }

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

async function godotVersion(bin: string): Promise<string> {
  const result=await runCommand(bin,['--version'],{timeoutMs:5000,maxOutputBytes:64*1024});
  if(result.code!==0)throw new Error(`exit ${result.code??'unknown'}`);
  return (result.stdout+result.stderr).trim();
}

export async function doctor(options: DoctorOptions): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  let godotBin=options.godotBin??null;
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
    const settings=await readFile(path.join(projectRoot,'project.godot'),'utf8');
    const autoload=settings.match(/\[autoload\]([^]*?)(?=\n\[|$)/)?.[1]??'';
    const runtimeOk=/GodotMcpRuntime\s*=\s*"\*res:\/\/addons\/godot_mcp\/runtime\/runtime_agent\.gd"/.test(autoload)&&await exists(path.join(projectRoot,'addons/godot_mcp/runtime/runtime_agent.gd'));
    const logger=await exists(path.join(projectRoot,'.godot-mcp/generated/runtime_logger.gd'));
    checks.push({id:'runtime',ok:runtimeOk,detail:!runtimeOk?'Runtime autoload not installed; run init with --godot':logger?'Runtime autoload and native diagnostic adapter installed':'Runtime installed; native diagnostics unavailable until init with a compatible Godot executable'});

    const configPath = path.join(projectRoot, '.godot-mcp', 'config.json');
    if (await exists(configPath)) {
      try {
        const config = await readProjectConfig(projectRoot);
        godotBin??=config.godotBin;
        checks.push({ id: 'protocol', ok:true, detail:'Protocol 1; configuration schema valid' });
      } catch (error) {
        checks.push({ id: 'protocol', ok: false, detail: `Invalid config.json: ${error instanceof Error ? error.message : String(error)}` });
      }
    } else {
      checks.push({ id: 'protocol', ok: false, detail: 'Missing .godot-mcp/config.json' });
    }
  } else {
    checks.push({ id: 'addon', ok: false, detail: 'Project unavailable' });
    checks.push({ id: 'runtime', ok: false, detail: 'Project unavailable' });
    checks.push({ id: 'protocol', ok: false, detail: 'Project unavailable' });
  }

  godotBin??=process.env.GODOT_BIN??null;
  if (!godotBin) {
    checks.push({ id: 'godot', ok: false, detail: 'Godot executable not configured' });
  } else if (!await exists(godotBin)) {
    checks.push({ id: 'godot', ok: false, detail: `Godot executable not found: ${godotBin}` });
  } else {
    try {
      const version = await godotVersion(godotBin);
      checks.push({ id: 'godot', ok: version.startsWith('4.'), detail: version || 'No version output' });
    } catch (error) {
      checks.push({ id: 'godot', ok: false, detail: `Unable to run Godot: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  if(projectRoot){try{const status=await serverStatus(projectRoot);checks.push({id:'bridge',ok:status.state!=='offline',required:false,detail:status.state==='offline'?'Server not running':`Authenticated server; editor connected: ${status.editorConnected}`});checks.push({id:'runtimeConnection',ok:status.runtimeConnected,required:false,detail:status.runtimeConnected?'Runtime agent connected':'Runtime agent not connected'});}catch{checks.push({id:'bridge',ok:false,required:false,detail:'Descriptor exists but live management could not be verified'});}}
  return { ok: checks.every(check => check.ok||check.required===false), checks };
}
