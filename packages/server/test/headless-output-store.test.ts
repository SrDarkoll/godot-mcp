import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_HEADLESS_OUTPUT_BYTES } from '@godot-mcp/protocol';
import { HeadlessOutputStore } from '../src/headless/headless-output-store.js';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';

async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-headless-output-'));
  const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);
  return {root,session,sessions,store:new HeadlessOutputStore(session,sessions)};
}

describe('headless output store',()=>{
  it('persists ordered stdout/stderr chunks with deterministic pagination',async()=>{
    const {store}=await fixture();const id=randomUUID();
    await store.append(id,'stdout','one');
    await store.append(id,'stderr','two');
    await store.append(id,'stdout','three');
    expect((await store.page(id,0,2)).entries.map(e=>[e.sequence,e.stream,e.text])).toEqual([[1,'stdout','one'],[2,'stderr','two']]);
    const second=await store.page(id,2,2);
    expect(second.entries.map(e=>e.sequence)).toEqual([3]);
    expect(second.nextCursor).toBe(3);
  });

  it('caps persisted UTF-8 payload at exactly 512 KiB and reports drain-after-cap',async()=>{
    const {store}=await fixture();const id=randomUUID();
    const first=await store.append(id,'stdout','a'.repeat(MAX_HEADLESS_OUTPUT_BYTES-2));
    expect(first.acceptedBytes).toBe(MAX_HEADLESS_OUTPUT_BYTES-2);
    const second=await store.append(id,'stdout','éé');
    expect(second).toMatchObject({acceptedBytes:2,truncated:true});
    const third=await store.append(id,'stderr','ignored');
    expect(third).toEqual({acceptedBytes:0,truncated:true});
    expect((await store.page(id,0,200)).truncated).toBe(true);
  });

  it('rejects linked logs and malformed stored JSONL',async()=>{
    const {root,session,sessions,store}=await fixture();const id=randomUUID();
    const dir=await sessions.ensureDirectory(session.id,'logs/headless');
    const outside=path.join(root,'outside.log');await fs.writeFile(outside,'x');
    try { await fs.symlink(outside,path.join(dir,`${id}.jsonl`)); }
    catch(error){ if(['EPERM','EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) return; throw error; }
    await expect(store.append(id,'stdout','x')).rejects.toMatchObject({code:'HEADLESS_OUTPUT_FAILED'});

    await fs.unlink(path.join(dir,`${id}.jsonl`));
    await fs.writeFile(path.join(dir,`${id}.jsonl`),'{bad json}\n');
    await expect(store.page(id,0,10)).rejects.toMatchObject({code:'HEADLESS_OUTPUT_FAILED'});
  });
});
