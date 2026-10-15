import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const checkerSource=new URL('./check-addon.mjs',import.meta.url);
const preload=`
const childProcess=require('node:child_process');
const {syncBuiltinESMExports}=require('node:module');
childProcess.spawnSync=(executable,args,options)=>{
  const mode=process.env.GODOT_MCP_CHECK_TEST_MODE;
  const importing=args.includes('--editor');
  const checkingScript=args.includes('--check-only') && args.some(arg=>arg.endsWith('/fixture.gd'));
  if(importing && (mode==='timeout' || options.timeout<45000))return {
    status:null,signal:'SIGTERM',stdout:'Godot Engine\\n',stderr:'',
    error:Object.assign(new Error('spawnSync fake-godot ETIMEDOUT'),{code:'ETIMEDOUT'})
  };
  if(importing && mode==='signal')return {status:null,signal:'SIGSEGV',stdout:'Godot Engine\\n',stderr:''};
  if(importing && mode==='spawn-error')return {
    status:null,signal:null,stdout:'',stderr:'',
    error:Object.assign(new Error('spawnSync fake-godot ENOENT'),{code:'ENOENT'})
  };
  if(checkingScript && mode==='parse-error')return {status:0,signal:null,stdout:'Godot Engine\\n',stderr:'SCRIPT ERROR: Parse Error: invalid fixture\\n'};
  if(checkingScript && mode==='exit-code')return {status:2,signal:null,stdout:'',stderr:'native failure\\n'};
  return {status:0,signal:null,stdout:'Godot Engine\\n',stderr:''};
};
syncBuiltinESMExports();
`;

async function runChecker(mode,verify){
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-addon-check-'));
  try{
    await fs.mkdir(path.join(workspace,'scripts'),{recursive:true});
    await fs.copyFile(checkerSource,path.join(workspace,'scripts','check-addon.mjs'));
    await fs.mkdir(path.join(workspace,'fixtures','empty-project'),{recursive:true});
    await fs.writeFile(path.join(workspace,'fixtures','empty-project','project.godot'),'config_version=5\n');
    const addon=path.join(workspace,'packages','godot-addon','addons','godot_mcp');
    await fs.mkdir(path.join(addon,'tools'),{recursive:true});
    await fs.writeFile(path.join(addon,'fixture.gd'),'extends Node\n');
    await fs.writeFile(path.join(addon,'tools','enable_plugin.gd'),'extends SceneTree\n');
    const mock=path.join(workspace,'mock-godot.cjs');
    await fs.writeFile(mock,preload);
    const result=spawnSync(process.execPath,['--require',mock,path.join(workspace,'scripts','check-addon.mjs')],{
      cwd:workspace,encoding:'utf8',windowsHide:true,timeout:10000,
      env:{...process.env,GODOT_BIN:'fake-godot',GODOT_MCP_CHECK_TEST_MODE:mode}
    });
    const evidenceParent=path.join(workspace,'.godot-mcp','visual-test-runs');
    const directories=await fs.readdir(evidenceParent);
    assert.equal(directories.length,1);
    const evidence=JSON.parse(await fs.readFile(path.join(evidenceParent,directories[0],'syntax-results.json'),'utf8'));
    await verify(result,evidence);
  }finally{
    const target=path.resolve(workspace);
    assert.equal(path.dirname(target),path.resolve(os.tmpdir()));
    assert(path.basename(target).startsWith('godot-mcp-addon-check-'));
    await fs.rm(target,{recursive:true,force:true});
  }
}

test('cold editor import gets its own bounded budget and waits for import completion',async()=>{
  await runChecker('cold-import',(result,evidence)=>{
    assert.equal(result.status,0,result.stdout+result.stderr);
    const importing=evidence.find(entry=>entry.args.includes('--editor'));
    assert(importing.args.includes('--import'));
    assert(!importing.args.includes('--quit'));
    assert.equal(importing.timeoutMs,120000);
    assert.equal(evidence.length,5,'enable, import, both scripts and generated logger must all run');
    for(const entry of evidence.filter(entry=>!entry.args.includes('--editor')))assert.equal(entry.timeoutMs,30000);
  });
});

test('a real import timeout still fails with process evidence and no automatic retry',async()=>{
  await runChecker('timeout',(result,evidence)=>{
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/timed out.*120000/i);
    assert.equal(evidence.length,2);
    assert.equal(evidence[1].error.code,'ETIMEDOUT');
    assert.equal(evidence[1].signal,'SIGTERM');
    assert.equal(evidence[1].status,null);
    assert.equal(typeof evidence[1].durationMs,'number');
  });
});

test('Godot parse diagnostics fail even when the native process returns zero',async()=>{
  await runChecker('parse-error',(result,evidence)=>{
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Parse Error: invalid fixture/);
    assert.equal(evidence.length,3);
    assert.equal(evidence[2].status,0);
  });
});

test('a native crash is distinguished from a GDScript parse failure',async()=>{
  await runChecker('signal',(result,evidence)=>{
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/SIGSEGV/);
    assert.equal(evidence[1].signal,'SIGSEGV');
  });
});

test('native startup errors retain their error code',async()=>{
  await runChecker('spawn-error',(result,evidence)=>{
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/ENOENT/);
    assert.equal(evidence[1].error.code,'ENOENT');
  });
});

test('nonzero native exit codes remain fatal',async()=>{
  await runChecker('exit-code',(result,evidence)=>{
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/status 2/);
    assert.equal(evidence[2].status,2);
  });
});
