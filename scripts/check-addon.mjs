import {cp,mkdir,mkdtemp,readdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const godot=process.env.GODOT_BIN;
if(!godot)throw new Error('GODOT_BIN is required for real GDScript validation');
const parent=path.resolve('.godot-mcp/visual-test-runs');
await mkdir(parent,{recursive:true});
const root=await mkdtemp(path.join(parent,'syntax-'));
await cp(path.resolve('fixtures/empty-project'),root,{recursive:true});
const addon=path.join(root,'addons/godot_mcp');
await cp(path.resolve('packages/godot-addon/addons/godot_mcp'),addon,{recursive:true});
const logs=[];
function run(args,{timeoutMs=30000}={}) {
  const started=performance.now();
  const result=spawnSync(godot,args,{encoding:'utf8',windowsHide:true,timeout:timeoutMs});
  const output=`${result.stdout??''}${result.stderr??''}`;
  const error=result.error?{code:result.error.code??null,message:result.error.message}:null;
  logs.push({args,status:result.status??null,signal:result.signal??null,error,
    timeoutMs,durationMs:Math.round(performance.now()-started),output});
  if(error || result.signal || result.status!==0 || /SCRIPT ERROR|Parse Error|Failed to load script/.test(output)) {
    const reason=error?.code==='ETIMEDOUT'?`Godot process timed out after ${timeoutMs} ms`:
      error?`Godot process could not run (${error.code??'unknown'}): ${error.message}`:
      result.signal?`Godot process terminated by ${result.signal}`:
      result.status!==0?`Godot process exited with status ${result.status}`:'GDScript diagnostics reported errors';
    throw new Error(`${reason}: ${args.join(' ')}\n${output}`);
  }
}
try {
  run(['--headless','--path',root,'--script','res://addons/godot_mcp/tools/enable_plugin.gd']);
  // Cold editor imports can exceed the per-script limit on hosted Windows runners.
  run(['--headless','--editor','--path',root,'--import'],{timeoutMs:120000});
  const files=(await readdir(addon,{recursive:true})).filter(f=>f.endsWith('.gd')).sort();
  for(const file of files)run(['--headless','--path',root,'--check-only','--script',`res://addons/godot_mcp/${file.replaceAll('\\','/')}`]);
  run(['--headless','--path',root,'--check-only','--script','res://.godot-mcp/generated/runtime_logger.gd']);
  console.info(`GDScript check passed: ${files.length} addon scripts + generated Logger. Evidence: ${root}`);
} finally {await writeFile(path.join(root,'syntax-results.json'),JSON.stringify(logs,null,2));}
