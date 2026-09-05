import { spawn } from 'node:child_process';

export interface EnablePluginResult {
  enabled: boolean;
  output: string;
}

export async function enablePlugin(projectRoot: string, godotBin: string): Promise<EnablePluginResult> {
  const args = [
    '--headless',
    '--path', projectRoot,
    '--script', 'res://addons/godot_mcp/tools/enable_plugin.gd'
  ];

  return await new Promise<EnablePluginResult>((resolve, reject) => {
    const child = spawn(godotBin, args, { windowsHide: true });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('close', code => {
      const enabled = code === 0 && output.includes('GODOT_MCP_PLUGIN_ENABLED');
      if (!enabled) {
        reject(new Error(`Godot failed to enable the plugin (exit ${code ?? 'unknown'}): ${output.trim()}`));
        return;
      }
      resolve({ enabled: true, output });
    });
  });
}
