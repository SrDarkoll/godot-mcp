import test from 'node:test';
import assert from 'node:assert/strict';
import {assertExactBundled,assertPackedFiles,publishDryRun} from './pack-release.mjs';

const exact=['@godot-mcp/protocol','@godot-mcp/server','@godot-mcp/godot-addon'];
const requiredFiles=[
 'package.json',
 'LICENSE',
 'README.md',
 'dist/index.js',
 'node_modules/@godot-mcp/protocol/package.json',
 'node_modules/@godot-mcp/protocol/dist/index.js',
 'node_modules/@godot-mcp/server/package.json',
 'node_modules/@godot-mcp/server/dist/index.js',
 'node_modules/@godot-mcp/godot-addon/package.json',
 'node_modules/@godot-mcp/godot-addon/addons/godot_mcp/plugin.gd',
 'node_modules/@godot-mcp/godot-addon/addons/godot_mcp/runtime/runtime_logger_46.gd.txt'
];

test('accepts only the exact internal bundled dependency set',()=>{
 assert.doesNotThrow(()=>assertExactBundled(exact));
 assert.doesNotThrow(()=>assertExactBundled([...exact].reverse()));
 assert.throws(()=>assertExactBundled([]),/Bundled dependency mismatch/);
 assert.throws(()=>assertExactBundled(['@godot-mcp/protocol']),/Bundled dependency mismatch/);
 assert.throws(()=>assertExactBundled([...exact,'other']),/Bundled dependency mismatch/);
});

test('accepts the required single-package runtime shape',()=>{
 assert.doesNotThrow(()=>assertPackedFiles(requiredFiles));
});

test('rejects missing runtime entries and project-state leakage',()=>{
 for(const required of requiredFiles){
  assert.throws(()=>assertPackedFiles(requiredFiles.filter(file=>file!==required)),/Missing packaged runtime file/);
 }
 assert.throws(()=>assertPackedFiles([...requiredFiles,'.godot-mcp/runtime/session.json']),/Unexpected packaged file/);
 assert.throws(()=>assertPackedFiles([...requiredFiles,'node_modules/unexpected/package.json']),/Unexpected packaged file/);
 assert.throws(()=>assertPackedFiles([...requiredFiles,'package.json.evil']),/Unexpected packaged file/);
 assert.throws(()=>assertPackedFiles([...requiredFiles,'node_modules/@godot-mcp/protocol/package.json.evil']),/Unexpected packaged file/);
});

test('packs one scoped tarball with all internal workspaces and cleans managed links',async()=>{
 const fs=await import('node:fs/promises');
 const os=await import('node:os');
 const path=await import('node:path');
 const {packRelease}=await import('./pack-release.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-pack-test-'));
 const previous=process.cwd();
 const manifests={
  cli:{name:'@srdarkx/godot-mcp',version:'0.1.0',private:false,type:'module',main:'dist/index.js',bin:{'godot-mcp':'dist/index.js'},dependencies:{'@godot-mcp/protocol':'0.1.0','@godot-mcp/server':'0.1.0','@godot-mcp/godot-addon':'0.1.0'},bundleDependencies:exact,files:['dist','LICENSE','README.md']},
  protocol:{name:'@godot-mcp/protocol',version:'0.1.0',private:true,main:'dist/index.js',files:['dist','LICENSE','README.md']},
  server:{name:'@godot-mcp/server',version:'0.1.0',private:true,main:'dist/index.js',files:['dist','LICENSE','README.md']},
  'godot-addon':{name:'@godot-mcp/godot-addon',version:'0.1.0',private:true,files:['addons/godot_mcp','LICENSE','README.md']}
 };
 try{
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'godot-mcp-monorepo',version:'0.1.0',private:true,workspaces:['packages/*']}));
  for(const [folder,manifest] of Object.entries(manifests)){
   const dir=path.join(root,'packages',folder);
   await fs.mkdir(dir,{recursive:true});
   await fs.writeFile(path.join(dir,'package.json'),JSON.stringify(manifest));
   await fs.writeFile(path.join(dir,'LICENSE'),'MIT\n');
   await fs.writeFile(path.join(dir,'README.md'),'# fixture\n');
  }
  await fs.mkdir(path.join(root,'packages/cli/dist'),{recursive:true});
  await fs.writeFile(path.join(root,'packages/cli/dist/index.js'),'console.log("cli")\n');
  await fs.mkdir(path.join(root,'packages/protocol/dist'),{recursive:true});
  await fs.writeFile(path.join(root,'packages/protocol/dist/index.js'),'export {}\n');
  await fs.mkdir(path.join(root,'packages/server/dist'),{recursive:true});
  await fs.writeFile(path.join(root,'packages/server/dist/index.js'),'export {}\n');
  await fs.mkdir(path.join(root,'packages/godot-addon/addons/godot_mcp/runtime'),{recursive:true});
  await fs.writeFile(path.join(root,'packages/godot-addon/addons/godot_mcp/plugin.gd'),'extends EditorPlugin\n');
  await fs.writeFile(path.join(root,'packages/godot-addon/addons/godot_mcp/runtime/runtime_logger_46.gd.txt'),'extends Node\n');
  process.chdir(root);
  const result=await packRelease();
  assert.equal(result.pkg.filename,'srdarkx-godot-mcp-0.1.0.tgz');
  assertExactBundled(result.pkg.bundled);
  assertPackedFiles(result.pkg.files);
  for(const [,folder] of [['','protocol'],['','server'],['','godot-addon']]){
   await assert.rejects(fs.lstat(path.join(root,'packages/cli/node_modules/@godot-mcp',folder)),error=>error?.code==='ENOENT');
  }
 }finally{
  process.chdir(previous);
  await fs.rm(root,{recursive:true,force:true});
 }
});


test('publish dry-run uses scoped public command and cleans managed links on npm failure',async()=>{
 const fs=await import('node:fs/promises');
 const os=await import('node:os');
 const path=await import('node:path');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-dry-run-test-'));
 const previousCwd=process.cwd();
 const previousExec=process.env.npm_execpath;
 const log=path.join(root,'npm-args.json');
 try{
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'godot-mcp-monorepo',version:'0.1.0',private:true,workspaces:['packages/*']}));
  await fs.mkdir(path.join(root,'packages','cli'),{recursive:true});
  await fs.writeFile(path.join(root,'packages','cli','package.json'),JSON.stringify({name:'@srdarkx/godot-mcp',version:'0.1.0',private:false}));
  for(const [,folder] of [['','protocol'],['','server'],['','godot-addon']]){
   const dir=path.join(root,'packages',folder);
   await fs.mkdir(dir,{recursive:true});
   await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({name:`@godot-mcp/${folder}`,version:'0.1.0'}));
  }
  const fake=path.join(root,'fake-npm.mjs');
  await fs.writeFile(fake,"import fs from 'node:fs'; fs.writeFileSync(process.env.FAKE_NPM_LOG,JSON.stringify(process.argv.slice(2))); process.exit(9);\n");
  process.chdir(root);
  process.env.npm_execpath=fake;
  process.env.FAKE_NPM_LOG=log;
  await assert.rejects(publishDryRun(),/npm publish failed/);
  const args=JSON.parse(await fs.readFile(log,'utf8'));
  assert.deepEqual(args,['publish','--dry-run','--access','public','--ignore-scripts','--workspace','@srdarkx/godot-mcp','--json']);
  for(const folder of ['protocol','server','godot-addon']){
   await assert.rejects(fs.lstat(path.join(root,'packages/cli/node_modules/@godot-mcp',folder)),error=>error?.code==='ENOENT');
  }
 }finally{
  process.chdir(previousCwd);
  if(previousExec===undefined)delete process.env.npm_execpath;else process.env.npm_execpath=previousExec;
  delete process.env.FAKE_NPM_LOG;
  await fs.rm(root,{recursive:true,force:true});
 }
});
