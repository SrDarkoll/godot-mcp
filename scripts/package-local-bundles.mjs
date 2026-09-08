import fs from 'node:fs/promises';
import path from 'node:path';

export const INTERNAL_BUNDLED_PACKAGES=Object.freeze([
 ['@godot-mcp/protocol','protocol'],
 ['@godot-mcp/server','server'],
 ['@godot-mcp/godot-addon','godot-addon']
]);

async function pathExists(file){
 try{
  await fs.lstat(file);
  return true;
 }catch(error){
  if(error?.code==='ENOENT')return false;
  throw error;
 }
}

export async function materializeBundledWorkspaceLinks({root,packageDir}){
 const created=[];
 const scopeDir=path.join(packageDir,'node_modules','@godot-mcp');
 await fs.mkdir(scopeDir,{recursive:true});
 try{
  for(const [,folder] of INTERNAL_BUNDLED_PACKAGES){
   const target=path.join(root,'packages',folder);
   const link=path.join(scopeDir,folder);
   await fs.stat(path.join(target,'package.json'));
   if(await pathExists(link))throw new Error(`Refusing to replace existing package-local path: ${link}`);
   const symlinkTarget=process.platform==='win32'?target:path.relative(path.dirname(link),target);
   await fs.symlink(symlinkTarget,link,process.platform==='win32'?'junction':'dir');
   created.push(link);
  }
 }catch(error){
  for(const link of created.reverse())await fs.rm(link,{force:true,recursive:true});
  throw error;
 }
 let cleaned=false;
 return async()=>{
  if(cleaned)return;
  cleaned=true;
  for(const link of [...created].reverse())await fs.rm(link,{force:true,recursive:true});
 };
}
