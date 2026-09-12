import { expect, it } from 'vitest';
import { ProjectEvents } from '../src/events/project-events.js';
it('replays bounded events with explicit gaps and resumes a waiting cursor', async () => {
  const events = new ProjectEvents('session', 2);
  events.append('editor.connected', {});
  events.append('scene.changed', { path: 'res://one.tscn' });
  events.append('import.finished', {});
  const page = await events.read(0, 10, 0);
  expect(page.events.map((e) => e.cursor)).toEqual([2, 3]);
  expect(page.dropped).toBe(1);
  expect(page.gap).toBe(true);
  expect((await events.read(1, 10, 0)).dropped).toBe(0);
  const waiting = events.read(3, 10, 1000);
  events.append('editor.disconnected', {});
  expect((await waiting).events[0]?.cursor).toBe(4);
  events.close();
  expect((await events.read(4, 10, 1000)).closed).toBe(true);
});
it('reports native source coalescing separately from replay eviction', async () => {
  const events = new ProjectEvents('session', 10);
  events.append('filesystem.changed', { dropped: 7 });
  expect(await events.read(0, 10, 0)).toMatchObject({ dropped: 0, sourceDropped: 7, gap: false });
  events.append('filesystem.changed', { dropped: 3 });
  expect((await events.read(1, 10, 0)).sourceDropped).toBe(7);
});
it('reports an event rejected by the server byte budget',async()=>{
 const events=new ProjectEvents('session');events.append('oversized',{value:'x'.repeat(20000)});
 expect(await events.read(0,10,0)).toMatchObject({events:[],serverDropped:1});
});
it('bounds concurrent subscriptions and releases them on shutdown', async () => {
  const events = new ProjectEvents('session');
  const pending = Array.from({ length: 16 }, () => events.read(0, 1, 30000));
  await expect(events.read(0, 1, 30000)).rejects.toMatchObject({ code: 'BUSY' });
  events.close();
  expect((await Promise.all(pending)).every((page) => page.closed)).toBe(true);
});
