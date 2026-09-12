import {runCommand} from '../process/run-command.js';

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

  const result=await runCommand(godotBin,args,{timeoutMs:30000,maxOutputBytes:512*1024});
  const output=result.stdout+result.stderr;
  if(result.code!==0||!output.includes('GODOT_MCP_PLUGIN_ENABLED'))throw new Error(`Godot failed to enable the plugin (exit ${result.code??'unknown'}): ${output.trim().slice(0,2000)}`);
  return {enabled:true,output};
}
