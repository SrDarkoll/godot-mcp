import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {createSession} from '../src/session/session.js';
import {SessionStore} from '../src/session/session-store.js';
import {ScreenshotStore} from '../src/visual/screenshot-store.js';

export const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
export const payload = {png_base64:png,width:1,height:1,scene:null,captured_at:'2026-09-05T00:00:00Z',viewport_index:null};
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-screenshots-'));
  const session = createSession(root); const sessions = new SessionStore(root);
  await sessions.create(session);
  return {session,sessions,store:new ScreenshotStore(session,sessions)};
}
const input = {type:'editor_2d' as const,payload,metadata:{label:'../../CON á:*',reason:'manual_request' as const,checkpoint:true}};
it('shares ordering across game and editor captures while binding game images to a run',async()=>{
  const {session,sessions,store}=await setup();
  await store.save(input);
  const runId='123e4567-e89b-42d3-a456-426614174000';
  const game=await store.save({...input,type:'game',runId});
  expect(game.screenshot).toMatchObject({type:'game',runId,sequence:2});
  expect(game.screenshot.path).toMatch(/^screenshots\/game\//);
  expect((await store.save(input)).screenshot.sequence).toBe(3);
  await expect(store.save({...input,type:'game'})).rejects.toMatchObject({code:'INVALID_CAPTURE_PAYLOAD'});
  expect((await sessions.read(session.id)).screenshots).toHaveLength(3);
});
it('persists unique images and checkpoints across concurrent saves and store restart',async () => {
  const {session,sessions,store} = await setup();
  const results = await Promise.all([store.save(input),store.save(input)]);
  results.push(await new ScreenshotStore(session,sessions).save(input));
  expect(results.map(r => r.screenshot.sequence)).toEqual([1,2,3]);
  for (const result of results) {
    const bytes = await fs.readFile(path.join(sessions.sessionDir(session.id),result.screenshot.path));
    expect(bytes).toEqual(Buffer.from(png,'base64'));
    expect(result.screenshot.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(result.checkpoint?.screenshotId).toBe(result.screenshot.id);
  }
  expect((await sessions.read(session.id)).screenshots).toHaveLength(3);
  await sessions.finish(session.id,new Date().toISOString());
  await expect(store.save(input)).rejects.toMatchObject({code:'SESSION_CLOSED'});
  expect(await fs.readdir(path.join(sessions.sessionDir(session.id),'screenshots/editor'))).toHaveLength(3);
});
it('rejects corrupt, noncanonical and dimension-mismatched images without writing',async () => {
  const {session,sessions,store} = await setup();
  const corrupt=Buffer.from(png,'base64');corrupt[45]=corrupt[45]! ^ 1;
  for (const patch of [{png_base64:'garbage'}, {png_base64:png+'\n'}, {png_base64:corrupt.toString('base64')}, {width:2}, {png_base64:Buffer.from('not png').toString('base64')}, {height:4097}]) {
    await expect(store.save({...input,payload:{...payload,...patch}})).rejects.toMatchObject({code:'INVALID_CAPTURE_PAYLOAD'});
  }
  expect((await sessions.read(session.id)).screenshots).toEqual([]);
});
it('retains the PNG when manifest publication fails and recovers for the next save',async () => {
  const {session,sessions,store} = await setup();
  const realRename = fs.rename;
  let calls = 0;
  const spy = vi.spyOn(fs,'rename').mockImplementation(async (...args) => {
    if (++calls === 2) throw new Error('disk full');
    return realRename(...args);
  });
  try { await expect(store.save(input)).rejects.toMatchObject({code:'MANIFEST_WRITE_FAILED'}); }
  finally { spy.mockRestore(); }
  expect((await sessions.read(session.id)).screenshots).toEqual([]);
  expect(await fs.readdir(path.join(sessions.sessionDir(session.id),'screenshots/editor'))).toHaveLength(1);
  expect((await store.save(input)).screenshot.sequence).toBe(2);
});
it('does not overwrite a colliding file and rejects an artifact directory junction',async () => {
  const {session,sessions,store} = await setup();
  const dir = path.join(sessions.sessionDir(session.id),'screenshots/editor');
  await fs.writeFile(path.join(dir,'0001_capture.png'),'keep');
  const simple = {...input,metadata:{...input.metadata,label:'capture'}};
  expect((await store.save(simple)).screenshot.sequence).toBe(2);
  expect(await fs.readFile(path.join(dir,'0001_capture.png'),'utf8')).toBe('keep');
  const {session:s2,sessions:ss2,store:st2} = await setup();
  const empty = path.join(ss2.sessionDir(s2.id),'screenshots/editor');
  await fs.rmdir(empty);
  await fs.symlink(dir,empty,'junction');
  await expect(st2.save(simple)).rejects.toMatchObject({code:'ARTIFACT_WRITE_FAILED'});
});
