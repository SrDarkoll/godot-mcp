import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
const cli=JSON.parse(await fs.readFile(new URL('../packages/cli/package.json',import.meta.url),'utf8'));
const protocol=JSON.parse(await fs.readFile(new URL('../packages/protocol/package.json',import.meta.url),'utf8'));
const server=JSON.parse(await fs.readFile(new URL('../packages/server/package.json',import.meta.url),'utf8'));
const addon=JSON.parse(await fs.readFile(new URL('../packages/godot-addon/package.json',import.meta.url),'utf8'));
const internal=['@godot-mcp/protocol','@godot-mcp/server','@godot-mcp/godot-addon'];

assert.equal(root.name,'godot-mcp-monorepo');
assert.equal(root.private,true);
assert.equal(cli.name,'@srdarkx/godot-mcp');
assert.equal(cli.private,false);
assert.equal(cli.version,root.version);
assert.deepEqual(cli.bin,{'godot-mcp':'dist/index.js'});
for(const name of internal){
 assert.equal(cli.dependencies?.[name],root.version,`${name} must be an exact runtime dependency`);
 assert(cli.bundleDependencies?.includes(name),`${name} must be bundled`);
}
assert.deepEqual(new Set(cli.bundleDependencies??[]),new Set(internal));
assert.equal(cli.bundleDependencies?.length,internal.length);

const externalRuntimeDependencies=new Map();
for(const workspace of [protocol,server,addon]){
 for(const [name,range] of Object.entries(workspace.dependencies??{})){
  if(internal.includes(name))continue;
  const previous=externalRuntimeDependencies.get(name);
  assert(previous===undefined||previous===range,`${name} has conflicting bundled workspace runtime ranges: ${previous} vs ${range}`);
  externalRuntimeDependencies.set(name,range);
 }
}
for(const [name,range] of externalRuntimeDependencies){
 assert.equal(cli.dependencies?.[name],range,`${name} must be promoted from bundled workspace runtime dependencies`);
}

console.log(`Public package metadata valid: ${cli.name}@${cli.version}`);
