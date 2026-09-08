import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const checkerSourceUrl=new URL('./check-public-package.mjs',import.meta.url);

async function writeJson(file,value){
 await fs.mkdir(path.dirname(file),{recursive:true});
 await fs.writeFile(file,`${JSON.stringify(value,null,2)}\n`);
}

async function runCheckerWith({cliDependencies}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-public-check-'));
 try{
  await fs.mkdir(path.join(root,'scripts'),{recursive:true});
  await fs.copyFile(checkerSourceUrl,path.join(root,'scripts','check-public-package.mjs'));
  await writeJson(path.join(root,'package.json'),{
   name:'godot-mcp-monorepo',version:'0.1.0',private:true
  });
  await writeJson(path.join(root,'packages','cli','package.json'),{
   name:'@srdarkx/godot-mcp',version:'0.1.0',private:false,
   bin:{'godot-mcp':'dist/index.js'},
   dependencies:cliDependencies,
   bundleDependencies:['@godot-mcp/protocol','@godot-mcp/server','@godot-mcp/godot-addon']
  });
  await writeJson(path.join(root,'packages','protocol','package.json'),{
   name:'@godot-mcp/protocol',version:'0.1.0',private:true,
   dependencies:{zod:'^4.0.0'}
  });
  await writeJson(path.join(root,'packages','server','package.json'),{
   name:'@godot-mcp/server',version:'0.1.0',private:true,
   dependencies:{
    '@godot-mcp/protocol':'0.1.0',
    '@modelcontextprotocol/server':'^2.0.0',
    ws:'^8.18.0',
    zod:'^4.0.0'
   }
  });
  await writeJson(path.join(root,'packages','godot-addon','package.json'),{
   name:'@godot-mcp/godot-addon',version:'0.1.0',private:true
  });
  return spawnSync(process.execPath,[path.join(root,'scripts','check-public-package.mjs')],{
   cwd:root,encoding:'utf8'
  });
 }finally{
  await fs.rm(root,{recursive:true,force:true});
 }
}

const internal={
 '@godot-mcp/protocol':'0.1.0',
 '@godot-mcp/server':'0.1.0',
 '@godot-mcp/godot-addon':'0.1.0'
};

test('rejects a public package that omits a bundled workspace runtime dependency',async()=>{
 const result=await runCheckerWith({
  cliDependencies:{...internal,ws:'^8.18.0',zod:'^4.0.0'}
 });
 assert.notEqual(result.status,0,`checker unexpectedly passed:\n${result.stdout}${result.stderr}`);
 assert.match(`${result.stdout}${result.stderr}`,/@modelcontextprotocol\/server/);
});

test('accepts the complete external runtime dependency surface of bundled workspaces',async()=>{
 const result=await runCheckerWith({
  cliDependencies:{
   ...internal,
   '@modelcontextprotocol/server':'^2.0.0',
   ws:'^8.18.0',
   zod:'^4.0.0'
  }
 });
 assert.equal(result.status,0,`${result.stdout}${result.stderr}`);
});
