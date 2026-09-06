import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveHeadlessTarget } from '../src/headless/headless-paths.js';

async function project():Promise<string>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-headless-paths-'));
  await fs.mkdir(path.join(root,'tests'),{recursive:true});
  await fs.mkdir(path.join(root,'levels'),{recursive:true});
  await fs.writeFile(path.join(root,'tests','smoke.gd'),'extends SceneTree\n');
  await fs.writeFile(path.join(root,'levels','main.tscn'),'[gd_scene format=3]\n');
  return root;
}

describe('headless project-local target resolver',()=>{
  it('resolves only existing regular project files with the requested extension',async()=>{
    const root=await project();
    await expect(resolveHeadlessTarget(root,'res://tests/smoke.gd','.gd')).resolves.toMatchObject({resourcePath:'res://tests/smoke.gd'});
    await expect(resolveHeadlessTarget(root,'res://levels/main.tscn','.tscn')).resolves.toMatchObject({resourcePath:'res://levels/main.tscn'});
  });

  it('rejects malformed, escaping, missing and wrong-extension targets',async()=>{
    const root=await project();
    for(const value of [
      '../x.gd','res://../x.gd','res:\\tests\\x.gd','C:\\x.gd','file://x.gd','res://a//b.gd',
      'res://a/../b.gd','res://a\\b.gd','res://a.gd\0evil','res://tests/smoke.tscn','res://tests/missing.gd'
    ]) await expect(resolveHeadlessTarget(root,value,'.gd')).rejects.toMatchObject({code:'HEADLESS_INVALID_TARGET'});
  });

  it('rejects linked files and linked parent directories',async()=>{
    const root=await project();
    const outside=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-headless-outside-'));
    await fs.writeFile(path.join(outside,'outside.gd'),'extends SceneTree\n');
    try {
      await fs.symlink(path.join(outside,'outside.gd'),path.join(root,'tests','linked.gd'));
      await fs.symlink(outside,path.join(root,'linked-parent'),'junction');
    } catch(error) {
      if(['EPERM','EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
      throw error;
    }
    await expect(resolveHeadlessTarget(root,'res://tests/linked.gd','.gd')).rejects.toMatchObject({code:'HEADLESS_INVALID_TARGET'});
    await expect(resolveHeadlessTarget(root,'res://linked-parent/outside.gd','.gd')).rejects.toMatchObject({code:'HEADLESS_INVALID_TARGET'});
  });
});
