import fs from 'node:fs/promises';
import path from 'node:path';

export const INTERNAL_BUNDLED_PACKAGES=Object.freeze([
 ['@godot-mcp/protocol','protocol'],
 ['@godot-mcp/server','server'],
 ['@godot-mcp/godot-addon','godot-addon']
]);

export const RUNTIME_BUNDLED_PACKAGES=Object.freeze([
 ...INTERNAL_BUNDLED_PACKAGES.map(([name])=>name),
 '@modelcontextprotocol/core','@modelcontextprotocol/server','smol-toml','ws','zod'
]);

async function installedPackage(root,from,name){
 if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)||name.includes('..'))throw new Error(`Invalid production dependency name: ${name}`);
 for(let directory=from;;directory=path.dirname(directory)){
  const candidate=path.join(directory,'node_modules',name);
  try{
   const manifest=JSON.parse(await fs.readFile(path.join(candidate,'package.json'),'utf8'));
   if(manifest.name!==name)throw new Error(`Production dependency identity mismatch: ${candidate}`);
   const real=await fs.realpath(candidate),relative=path.relative(root,real);
   if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error(`Production dependency escapes the release workspace: ${name}`);
   return {directory:real,manifest};
  }catch(error){if(error?.code!=='ENOENT')throw error;}
  if(directory===root||path.dirname(directory)===directory)break;
 }
 throw new Error(`Missing installed production dependency: ${name}`);
}

async function pathExists(file){
 try{
  await fs.lstat(file);
  return true;
 }catch(error){
  if(error?.code==='ENOENT')return false;
  throw error;
 }
}

export async function materializeBundledWorkspaceLinks({root,packageDir,runtimeDependencies=[]}){
 root=await fs.realpath(root);
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
  const resolved=new Map(),queue=runtimeDependencies.map(name=>({name,from:root}));
  while(queue.length){
   const {name,from}=queue.shift();
   if(INTERNAL_BUNDLED_PACKAGES.some(([internal])=>name===internal))continue;
   const dependency=await installedPackage(root,from,name);
   if(resolved.has(name)){
    if(resolved.get(name)!==dependency.directory)throw new Error(`Conflicting installed production versions: ${name}`);
    continue;
   }
   resolved.set(name,dependency.directory);
   const link=path.join(packageDir,'node_modules',name);
   await fs.mkdir(path.dirname(link),{recursive:true});
   const parent=await fs.lstat(path.dirname(link));
   if(parent.isSymbolicLink()||!parent.isDirectory())throw new Error(`Unsafe package-local scope: ${path.dirname(link)}`);
   if(await pathExists(link))throw new Error(`Refusing to replace existing package-local path: ${link}`);
   const target=process.platform==='win32'?dependency.directory:path.relative(path.dirname(link),dependency.directory);
   await fs.symlink(target,link,process.platform==='win32'?'junction':'dir');
   created.push(link);
   for(const child of Object.keys(dependency.manifest.dependencies??{}))queue.push({name:child,from:dependency.directory});
  }
 }catch(error){
  for(const link of created.reverse())await fs.unlink(link);
  throw error;
 }
 let cleaned=false;
 return async()=>{
  if(cleaned)return;
  cleaned=true;
  for(const link of [...created].reverse())await fs.unlink(link);
 };
}
