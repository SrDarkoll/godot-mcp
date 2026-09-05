import {mkdir,mkdtemp,cp} from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';import {expect,it} from 'vitest';
it('bounds and validates debugger capture fragments in real GDScript',async()=>{
 const godot=process.env.GODOT_BIN;if(!godot)throw new Error('GODOT_BIN required');
 const parent=path.resolve('.godot-mcp/runtime-test-runs');await mkdir(parent,{recursive:true});const root=await mkdtemp(path.join(parent,'assembler-'));
 await cp(path.resolve('fixtures/empty-project'),root,{recursive:true});await cp(path.resolve('packages/godot-addon/addons'),path.join(root,'addons'),{recursive:true});
 const result=spawnSync(godot,['--headless','--path',root,'--script',path.resolve('tests/integration/helpers/capture-assembler-test.gd')],{windowsHide:true,encoding:'utf8',timeout:10000});
 expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('CAPTURE_ASSEMBLER_PASS');
});
