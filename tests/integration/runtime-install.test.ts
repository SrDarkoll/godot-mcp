import {mkdir,mkdtemp,cp,readFile,writeFile,stat} from 'node:fs/promises';import path from 'node:path';
import {expect,it} from 'vitest';import {initProject} from '../../packages/cli/src/init/init-project.js';
it('installs the runtime autoload idempotently and refuses a conflicting autoload',async()=>{
 const godot=process.env.GODOT_BIN;if(!godot)throw new Error('GODOT_BIN required');
 const parent=path.resolve('.godot-mcp/runtime-test-runs');await mkdir(parent,{recursive:true});const root=await mkdtemp(path.join(parent,'install-'));
 await cp(path.resolve('fixtures/empty-project'),root,{recursive:true});
 await initProject({projectRoot:root,godotBin:godot,enable:true});await initProject({projectRoot:root,godotBin:godot,enable:true});
 const file=path.join(root,'project.godot');const config=await readFile(file,'utf8');
 expect(config.match(/GodotMcpRuntime=/g)).toHaveLength(1);expect(config).toContain('*res://addons/godot_mcp/runtime/runtime_agent.gd');
 await expect(stat(path.join(root,'.godot-mcp/generated/runtime_logger.gd'))).resolves.toBeDefined();
 await writeFile(path.join(root,'external.gd'),'extends Node\n');
 const collision=config.replace('*res://addons/godot_mcp/runtime/runtime_agent.gd','*res://external.gd');await writeFile(file,collision);
 await expect(initProject({projectRoot:root,godotBin:godot,enable:true})).rejects.toThrow('AUTOLOAD_NAME_CONFLICT');
 expect(await readFile(file,'utf8')).toBe(collision);
},30000);
