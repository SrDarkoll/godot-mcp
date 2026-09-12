import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function npm(args,cwd){
 const entry=process.env.npm_execpath;
 if(!entry)throw new Error('Run this script through npm run');
 const result=spawnSync(process.execPath,[entry,...args],{cwd,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
 if(result.error||result.status!==0)throw new Error(`npm ${args[0]} failed: ${result.stderr||result.error?.message}`);
 return result.stdout;
}
export async function packRelease(){
 const root=path.resolve('.');
 const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const out=path.join(root,'.godot-mcp/distribution',manifest.version+'-'+randomUUID().slice(0,8));
 await fs.mkdir(out,{recursive:true});
 const packages=[];
 for(const folder of ['protocol','server','godot-addon','cli']){
  const dir=path.join(root,'packages',folder);const config=JSON.parse(await fs.readFile(path.join(dir,'package.json'),'utf8'));
  if(config.version!==manifest.version||config.license!=='MIT'||!Array.isArray(config.files))throw new Error(`Incomplete package metadata: ${folder}`);
  const [packed]=JSON.parse(npm(['pack','--json','--ignore-scripts','--workspace',config.name,'--pack-destination',out],root));
  const files=packed.files.map(file=>file.path);
  if(!files.includes('LICENSE')||!files.includes('README.md'))throw new Error(`Missing package documentation: ${folder}`);
  for(const file of files){if(!/^(package\.json|LICENSE|README\.md|dist\/|addons\/godot_mcp\/)/.test(file)||file.includes('..')||file.includes('.godot-mcp'))throw new Error(`Unexpected packaged file: ${folder}/${file}`);}
  if(folder==='godot-addon'&&!files.includes('addons/godot_mcp/runtime/runtime_logger_46.gd.txt'))throw new Error('Logger template missing');
  if(folder!=='godot-addon'&&!files.includes('dist/index.js'))throw new Error('Built package entry missing');
  const bytes=await fs.readFile(path.join(out,packed.filename));
  packages.push({name:config.name,version:config.version,filename:packed.filename,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,files});
 }
 await fs.writeFile(path.join(out,'release-manifest.json'),JSON.stringify({version:manifest.version,private:true,node:process.versions.node,packages},null,2));
 return {out,packages};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){console.log(JSON.stringify(await packRelease(),null,2));}
