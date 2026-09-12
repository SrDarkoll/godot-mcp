import fs from 'node:fs/promises';
import path from 'node:path';
const roots=['README.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','docs'];
const files=[];
async function walk(value){const stat=await fs.lstat(value);if(stat.isSymbolicLink())throw new Error(`Linked documentation path: ${value}`);if(stat.isDirectory()){for(const name of await fs.readdir(value))await walk(path.join(value,name));}else if(value.endsWith('.md'))files.push(value);}
for(const root of roots)await walk(root);
const missing=[];
for(const file of files){const text=await fs.readFile(file,'utf8');for(const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){let target=match[1].trim();if(target.startsWith('<')&&target.endsWith('>'))target=target.slice(1,-1);if(/^(?:https?:|mailto:|#|codex:)/i.test(target))continue;target=decodeURIComponent(target.split('#')[0]);const resolved=path.resolve(path.dirname(file),target);try{const stat=await fs.lstat(resolved);if(stat.isSymbolicLink())throw new Error();}catch{missing.push(`${file}: ${match[1]}`);}}}
if(missing.length)throw new Error(`Broken documentation links:\n${missing.join('\n')}`);
console.log(`Documentation links verified: ${files.length} Markdown files`);
