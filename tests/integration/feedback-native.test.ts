import {expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const godotBin=process.env.GODOT_BIN;

it.skipIf(!godotBin)('reproduces compiler, pagination and property feedback with Godot',async()=>{
  const parent=path.resolve('.godot-mcp/feedback-test-runs');
  await fs.mkdir(parent,{recursive:true});
  const project=await fs.mkdtemp(path.join(parent,'native-'));
  await fs.cp(path.resolve('packages/godot-addon/addons'),path.join(project,'addons'),{recursive:true});
  await fs.copyFile(path.resolve('tests/fixtures/feedback_native_test.gd'),path.join(project,'test.gd'));
  await fs.writeFile(path.join(project,'project.godot'),'config_version=5\n[application]\nconfig/name="Feedback fixture"\n');
  const imported=spawnSync(godotBin!,['--headless','--path',project,'--editor','--import'],{encoding:'utf8',windowsHide:true,timeout:40000});
  expect(imported.status,imported.stderr+imported.stdout).toBe(0);
  const result=spawnSync(godotBin!,['--headless','--path',project,'--script','res://test.gd'],{encoding:'utf8',windowsHide:true,timeout:40000});
  await fs.writeFile(path.join(project,'test-output.log'),result.stdout+'\n'+result.stderr);
  expect(result.status,result.stdout+'\n'+result.stderr).toBe(0);
  const line=result.stdout.split(/\r?\n/).find(value=>value.startsWith('MCP_FEEDBACK_NATIVE '));
  expect(line).toBeDefined();
  const summary=JSON.parse(line!.slice('MCP_FEEDBACK_NATIVE '.length));
  expect(summary.failures).toEqual([]);
  expect(summary.enumerated).toBe(1907);
},90000);
