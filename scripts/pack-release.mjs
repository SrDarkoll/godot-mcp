import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {INTERNAL_BUNDLED_PACKAGES,materializeBundledWorkspaceLinks} from './package-local-bundles.mjs';

export const PUBLIC_PACKAGE='@srdarkx/godot-mcp';
export const REQUIRED_BUNDLED=Object.freeze(INTERNAL_BUNDLED_PACKAGES.map(([name])=>name));

export function npm(args,cwd){
 const entry=process.env.npm_execpath;
 if(!entry)throw new Error('Run this script through npm run');
 const result=spawnSync(process.execPath,[entry,...args],{cwd,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
 if(result.error||result.status!==0)throw new Error(`npm ${args[0]} failed: ${result.stderr||result.stdout||result.error?.message}`);
 return result.stdout;
}

export function assertExactBundled(actual){
 const expected=[...REQUIRED_BUNDLED].sort();
 const received=[...(actual??[])].sort();
 if(received.length!==expected.length||received.some((name,index)=>name!==expected[index])){
  throw new Error(`Bundled dependency mismatch: expected ${expected.join(', ')}, got ${received.join(', ')||'(none)'}`);
 }
}

const REQUIRED_FILES=Object.freeze([
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
]);

export function assertPackedFiles(files){
 const set=new Set(files);
 for(const required of REQUIRED_FILES){
  if(!set.has(required))throw new Error(`Missing packaged runtime file: ${required}`);
 }
 for(const file of files){
  const allowed=/^(?:package\.json|LICENSE|README\.md|dist\/.+|node_modules\/@godot-mcp\/(?:protocol|server)\/(?:package\.json|LICENSE|README\.md|dist\/.+)|node_modules\/@godot-mcp\/godot-addon\/(?:package\.json|LICENSE|README\.md|addons\/godot_mcp\/.+))$/.test(file);
  if(!allowed||file.includes('..')||file.includes('.godot-mcp'))throw new Error(`Unexpected packaged file: ${file}`);
 }
}

function parsePackJson(stdout){
 const parsed=JSON.parse(stdout);
 const candidate=Array.isArray(parsed)?parsed[0]:parsed;
 const result=candidate?.name?candidate:candidate?.[PUBLIC_PACKAGE];
 if(!result||typeof result!=='object')throw new Error('npm packaging command returned no package metadata');
 return result;
}

async function withManagedBundleLinks(root,action){
 const packageDir=path.join(root,'packages','cli');
 const cleanup=await materializeBundledWorkspaceLinks({root,packageDir});
 try{return await action();}finally{await cleanup();}
}

function validatePackageMetadata(packed,manifest){
 if(packed.name!==PUBLIC_PACKAGE)throw new Error(`Unexpected packed package: ${packed.name}`);
 if(packed.version!==manifest.version)throw new Error(`Packed version mismatch: ${packed.version} != ${manifest.version}`);
 assertExactBundled(packed.bundled);
 const files=(packed.files??[]).map(file=>file.path);
 assertPackedFiles(files);
 return files;
}

export async function packRelease(){
 const root=path.resolve('.');
 const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const cli=JSON.parse(await fs.readFile(path.join(root,'packages','cli','package.json'),'utf8'));
 if(manifest.name!=='godot-mcp-monorepo'||manifest.private!==true)throw new Error('Invalid private root package metadata');
 if(cli.name!==PUBLIC_PACKAGE||cli.private!==false||cli.version!==manifest.version)throw new Error('Invalid public package metadata');
 const out=path.join(root,'.godot-mcp','distribution',manifest.version+'-'+randomUUID().slice(0,8));
 await fs.mkdir(out,{recursive:true});
 const packed=await withManagedBundleLinks(root,async()=>parsePackJson(npm(['pack','--json','--ignore-scripts','--workspace',PUBLIC_PACKAGE,'--pack-destination',out],root)));
 const files=validatePackageMetadata(packed,manifest);
 const bytes=await fs.readFile(path.join(out,packed.filename));
 const pkg={
  name:packed.name,
  version:packed.version,
  filename:packed.filename,
  sha256:createHash('sha256').update(bytes).digest('hex'),
  bytes:bytes.length,
  bundled:[...packed.bundled],
  files
 };
 await fs.writeFile(path.join(out,'release-manifest.json'),JSON.stringify({version:manifest.version,private:true,node:process.versions.node,package:pkg},null,2));
 return {out,pkg};
}

export async function publishDryRun(){
 const root=path.resolve('.');
 const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const packed=await withManagedBundleLinks(root,async()=>parsePackJson(npm(['publish','--dry-run','--access','public','--ignore-scripts','--workspace',PUBLIC_PACKAGE,'--json'],root)));
 validatePackageMetadata(packed,manifest);
 return packed;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=process.argv.includes('--publish-dry-run')?await publishDryRun():await packRelease();
 console.log(JSON.stringify(result,null,2));
}
