import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {expect,it} from 'vitest';
import {discoverGodotExecutable} from '../src/setup/godot-discovery.js';

async function tempRoot():Promise<string>{return await mkdtemp(path.join(tmpdir(),'godot-mcp-discovery-'));}

it('finds a versioned Godot executable in the bounded Windows Desktop fallback',async()=>{
 const home=await tempRoot();const desktop=path.join(home,'Desktop');await mkdir(desktop);
 const candidate=path.join(desktop,'Godot_v4.6.3-stable_win64.exe');await writeFile(candidate,'fixture');
 const found=await discoverGodotExecutable({platform:'win32',homeDir:home,env:{PATH:''},validateCandidate:async value=>value===path.resolve(candidate)});
 expect(found).toBe(path.resolve(candidate));
});

it('prefers PATH candidates before fallback directories and deduplicates candidates',async()=>{
 const home=await tempRoot();const bin=path.join(home,'bin');const desktop=path.join(home,'Desktop');await mkdir(bin);await mkdir(desktop);
 const onPath=path.join(bin,'godot4.exe');const fallback=path.join(desktop,'Godot_v4.6.3-stable_win64.exe');
 await writeFile(onPath,'fixture');await writeFile(fallback,'fixture');
 const validated:string[]=[];
 const found=await discoverGodotExecutable({platform:'win32',homeDir:home,env:{PATH:bin},validateCandidate:async value=>{validated.push(value);return value===path.resolve(onPath)||value===path.resolve(fallback);}});
 expect(found).toBe(path.resolve(onPath));
 expect(validated[0]).toBe(path.resolve(onPath));
});

it('returns null when no bounded candidate validates',async()=>{
 const home=await tempRoot();
 await expect(discoverGodotExecutable({platform:'win32',homeDir:home,env:{PATH:''},validateCandidate:async()=>false})).resolves.toBeNull();
});
