import fs from 'node:fs/promises';
import path from 'node:path';
import { BridgeRpcError } from '../bridge/rpc-router.js';

function invalid(message='Invalid project-local headless target'):never{
  throw new BridgeRpcError('HEADLESS_INVALID_TARGET',message);
}

export async function resolveHeadlessTarget(
  projectRoot:string,
  resourcePath:string,
  extension:'.gd'|'.tscn'
):Promise<{resourcePath:string;absolutePath:string}>{
  if(typeof resourcePath!=='string' || !resourcePath.startsWith('res://') || !resourcePath.endsWith(extension)) invalid();
  const relative=resourcePath.slice('res://'.length);
  if(!relative || relative.includes('..') || relative.includes('\\') || relative.includes('\0') || relative.includes('//') || relative.includes(':')) invalid();
  const parts=relative.split('/');
  if(parts.some(part=>!part || part==='.' || part==='..')) invalid();

  let rootReal:string;
  try { rootReal=await fs.realpath(projectRoot); }
  catch { invalid('Project root is unavailable'); }

  let current=rootReal!;
  for(let index=0;index<parts.length;index++){
    current=path.join(current,parts[index]!);
    let stat;
    try { stat=await fs.lstat(current); }
    catch { invalid('Headless target does not exist'); }
    if(stat!.isSymbolicLink()) invalid('Linked headless target rejected');
    if(index<parts.length-1){
      if(!stat!.isDirectory()) invalid('Headless target parent is not a directory');
    }else if(!stat!.isFile() || stat!.nlink>1){
      invalid('Headless target must be an ordinary file');
    }
  }

  let real:string;
  try { real=await fs.realpath(current); }
  catch { invalid('Headless target cannot be resolved'); }
  if(real!==rootReal && !real.startsWith(rootReal+path.sep)) invalid('Headless target escapes project root');
  return {resourcePath,absolutePath:real};
}
