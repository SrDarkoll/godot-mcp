import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {INTERNAL_BUNDLED_PACKAGES,materializeBundledWorkspaceLinks} from './package-local-bundles.mjs';

async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-bundles-'));
 const packageDir=path.join(root,'packages','cli');
 await fs.mkdir(packageDir,{recursive:true});
 for(const [,folder] of INTERNAL_BUNDLED_PACKAGES){
  const dir=path.join(root,'packages',folder);
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({name:`@fixture/${folder}`,version:'0.1.0'}));
 }
 return {root,packageDir};
}

async function exists(file){
 try{await fs.lstat(file);return true;}catch(error){if(error?.code==='ENOENT')return false;throw error;}
}

test('materializes exactly the managed workspace links and cleans them',async()=>{
 const {root,packageDir}=await fixture();
 const cleanup=await materializeBundledWorkspaceLinks({root,packageDir});
 for(const [,folder] of INTERNAL_BUNDLED_PACKAGES){
  const link=path.join(packageDir,'node_modules','@godot-mcp',folder);
  const stat=await fs.lstat(link);
  assert(stat.isSymbolicLink()||stat.isDirectory());
  assert.equal(await fs.realpath(link),await fs.realpath(path.join(root,'packages',folder)));
 }
 await cleanup();
 for(const [,folder] of INTERNAL_BUNDLED_PACKAGES){
  assert.equal(await exists(path.join(packageDir,'node_modules','@godot-mcp',folder)),false);
 }
});

test('fails closed on a conflicting managed path and leaves it untouched',async()=>{
 const {root,packageDir}=await fixture();
 const conflict=path.join(packageDir,'node_modules','@godot-mcp','server');
 await fs.mkdir(conflict,{recursive:true});
 await fs.writeFile(path.join(conflict,'KEEP'),'untouched');
 await assert.rejects(materializeBundledWorkspaceLinks({root,packageDir}),/Refusing to replace existing package-local path/);
 assert.equal(await fs.readFile(path.join(conflict,'KEEP'),'utf8'),'untouched');
 assert.equal(await exists(path.join(packageDir,'node_modules','@godot-mcp','protocol')),false);
});

test('cleanup preserves unrelated siblings in the package-local scope',async()=>{
 const {root,packageDir}=await fixture();
 const sibling=path.join(packageDir,'node_modules','@godot-mcp','other');
 await fs.mkdir(sibling,{recursive:true});
 await fs.writeFile(path.join(sibling,'KEEP'),'untouched');
 const cleanup=await materializeBundledWorkspaceLinks({root,packageDir});
 await cleanup();
 assert.equal(await fs.readFile(path.join(sibling,'KEEP'),'utf8'),'untouched');
});
