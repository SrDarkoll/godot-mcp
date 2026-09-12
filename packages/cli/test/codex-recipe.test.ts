import {expect,it} from 'vitest';
import {codexRecipe} from '../src/setup/codex-recipe.js';
it('resolves the ESM server entry without changing the Codex profile',()=>{
 const recipe=codexRecipe('C:/Project With Spaces');
 expect(recipe.changedProfile).toBe(false);
 expect(recipe.command.slice(0,5)).toEqual(['codex','mcp','add','godot-mcp','--']);
 expect(recipe.command.some(value=>value.endsWith('index.js'))).toBe(true);
 expect(recipe.toml).toContain('[mcp_servers.godot-mcp]');
});
