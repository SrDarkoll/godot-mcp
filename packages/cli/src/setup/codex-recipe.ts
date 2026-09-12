import {fileURLToPath} from 'node:url';
export function codexRecipe(projectRoot:string){
 const entry=fileURLToPath(import.meta.resolve('@godot-mcp/server'));
 const args=[entry,'--project',projectRoot];
 return {changedProfile:false,command:['codex','mcp','add','godot-mcp','--',process.execPath,...args],
  toml:`[mcp_servers.godot-mcp]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify(args)}\n`};
}
