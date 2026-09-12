import {mkdir,mkdtemp,cp} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {expect,it} from 'vitest';
it('bounds native serialization of cycles, deep/wide values and oversized strings',async()=>{
 const godot=process.env.GODOT_BIN;if(!godot)throw new Error('GODOT_BIN required');
 const parent=path.resolve('.godot-mcp/recovery-test-runs');await mkdir(parent,{recursive:true});
 const root=await mkdtemp(path.join(parent,'serialization-'));
 await cp(path.resolve('fixtures/empty-project'),root,{recursive:true});
 await cp(path.resolve('packages/godot-addon/addons'),path.join(root,'addons'),{recursive:true});
 const result=spawnSync(godot,['--headless','--path',root,'--script',path.resolve('tests/integration/helpers/serialization-budget-test.gd')],{encoding:'utf8',windowsHide:true,timeout:15000});
 expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('SERIALIZATION_BUDGET_PASS');
});
