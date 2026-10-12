import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateChecker, formatUpdateNotice, isNewerStableRelease, updateChecksEnabled } from '../src/updates/update-checker.js';

const roots: string[] = [];
async function cacheFile(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-updates-'));
  roots.push(root);
  return path.join(root, 'updates.json');
}
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('stable npm release comparison', () => {
  it.each([
    ['0.6.3', '0.6.2', true], ['0.6.10', '0.6.9', true], ['1.0.0', '0.99.99', true],
    ['0.6.2', '0.6.2', false], ['0.6.1', '0.6.2', false], ['0.6.2+build.2', '0.6.2+build.1', false],
    ['0.6.3', '0.6.3-beta.1', true], ['0.6.2', '0.7.0-beta.1', false],
    ['0.7.0-beta.1', '0.6.2', false], ['bad', '0.6.2', false], ['0.6.3', 'bad', false],
    ['00.6.3', '0.6.2', false], ['0.6.3;echo bad', '0.6.2', false]
  ])('%s compared with %s -> %s', (latest, current, expected) => {
    expect(isNewerStableRelease(latest, current)).toBe(expected);
  });
});

it('uses one request for concurrent checks, reuses the daily cache across processes and expires it', async () => {
  const file = await cacheFile();
  let now = 1_800_000_000_000;
  const requestLatest = vi.fn().mockResolvedValue('0.6.3');
  const options = { currentVersion: '0.6.2', cacheFile: file, requestLatest, enabled: true, now: () => now };
  const checker = new UpdateChecker(options);
  const results = await Promise.all([checker.check(), checker.check(), checker.check()]);
  expect(results).toEqual(Array(3).fill({ currentVersion: '0.6.2', latestVersion: '0.6.3' }));
  expect(requestLatest).toHaveBeenCalledTimes(1);
  expect(JSON.parse(await fs.readFile(file, 'utf8'))).toMatchObject({ packageName: '@srdarkx/godot-mcp', latest: '0.6.3' });
  await new UpdateChecker(options).check();
  expect(requestLatest).toHaveBeenCalledTimes(1);
  now += 24 * 60 * 60 * 1000 + 1;
  requestLatest.mockResolvedValue('0.7.0');
  expect(await checker.check()).toMatchObject({ latestVersion: '0.7.0' });
  expect(requestLatest).toHaveBeenCalledTimes(2);
});

it('contains offline failures and retries after an hour', async () => {
  const file = await cacheFile();
  let now = 1_800_000_000_000;
  const requestLatest = vi.fn().mockRejectedValue(new Error('offline'));
  const checker = new UpdateChecker({ currentVersion: '0.6.2', cacheFile: file, enabled: true, requestLatest, now: () => now });
  expect(await checker.check()).toBeNull();
  expect(await checker.check()).toBeNull();
  expect(requestLatest).toHaveBeenCalledTimes(1);
  now += 60 * 60 * 1000 + 1;
  requestLatest.mockResolvedValue('0.6.3');
  expect(await checker.check()).toMatchObject({ latestVersion: '0.6.3' });
});

it('remembers CLI notices per release for a day without consuming MCP notices', async () => {
  const file = await cacheFile();
  let now = 1_800_000_000_000;
  const requestLatest = vi.fn().mockResolvedValue('0.6.3');
  const options = { currentVersion: '0.6.2', cacheFile: file, enabled: true, requestLatest, now: () => now };
  const first = new UpdateChecker(options);
  const update = (await first.check())!;
  expect(await first.claimCliNotice(update)).toBe(true);
  const second = new UpdateChecker(options);
  expect(await second.check()).toEqual(update);
  expect(await second.claimCliNotice(update)).toBe(false);
  expect(await second.check()).toEqual(update);
  now += 24 * 60 * 60 * 1000 + 1;
  expect(await second.check()).toEqual(update);
  expect(await second.claimCliNotice(update)).toBe(true);
  now += 24 * 60 * 60 * 1000 + 1;
  requestLatest.mockResolvedValue('0.7.0');
  const newer = (await second.check())!;
  expect(await second.claimCliNotice(newer)).toBe(true);
});

it('ignores malformed notification state while retaining a valid cached release', async () => {
  const file = await cacheFile();
  await fs.writeFile(file, JSON.stringify({ schema: 1, packageName: '@srdarkx/godot-mcp',
    checkedAt: 1_800_000_000_000, latest: '0.6.3', failed: false,
    lastNotice: { currentVersion: '0.6.2', latestVersion: '0.6.3', shownAt: 1_900_000_000_000 } }));
  const requestLatest = vi.fn();
  const checker = new UpdateChecker({ currentVersion: '0.6.2', cacheFile: file, enabled: true, requestLatest, now: () => 1_800_000_000_000 });
  const update = (await checker.check())!;
  expect(await checker.claimCliNotice(update)).toBe(true);
  expect(requestLatest).not.toHaveBeenCalled();
});

it('aborts an unresponsive registry without rejecting or hanging the caller', async () => {
  const file = await cacheFile();
  let signal: AbortSignal | undefined;
  const checker = new UpdateChecker({
    currentVersion: '0.6.2', cacheFile: file, enabled: true, timeoutMs: 30,
    requestLatest: incoming => { signal = incoming; return new Promise(() => {}); }
  });
  const started = performance.now();
  expect(await checker.check()).toBeNull();
  expect(signal?.aborted).toBe(true);
  expect(performance.now() - started).toBeLessThan(1000);
});

it.each(['{broken', JSON.stringify({ schema: 1, packageName: 'other', checkedAt: 1_800_000_000_000, latest: '9.9.9', failed: false }),
  JSON.stringify({ schema: 1, packageName: '@srdarkx/godot-mcp', checkedAt: 1_900_000_000_000, latest: '9.9.9', failed: false }),
  'x'.repeat(9000)])('ignores a corrupt or unrelated cache', async text => {
  const file = await cacheFile();
  await fs.writeFile(file, text);
  const requestLatest = vi.fn().mockResolvedValue('0.6.2');
  expect(await new UpdateChecker({ cacheFile: file, currentVersion: '0.6.2', enabled: true, requestLatest, now: () => 1_800_000_000_000 }).check()).toBeNull();
  expect(requestLatest).toHaveBeenCalledTimes(1);
});

it('ignores cache write failures and does not require npm credentials', async () => {
  const file = await cacheFile();
  await fs.writeFile(file, 'not a directory');
  expect(await new UpdateChecker({ currentVersion: '0.6.2', cacheFile: path.join(file, 'cache.json'), enabled: true,
    requestLatest: async () => '0.6.3' }).check()).toMatchObject({ latestVersion: '0.6.3' });
});

it('fetches only public dist-tags and rejects oversized, invalid, prerelease and failed responses', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ latest: '0.6.3' })));
  vi.stubGlobal('fetch', fetchMock);
  expect(await new UpdateChecker({ currentVersion: '0.6.2', cacheFile: await cacheFile(), enabled: true }).check()).toMatchObject({ latestVersion: '0.6.3' });
  const [url, options] = fetchMock.mock.calls[0]!;
  expect(url).toBe('https://registry.npmjs.org/-/package/@srdarkx%2fgodot-mcp/dist-tags');
  expect(options).toMatchObject({ redirect: 'error', credentials: 'omit' });
  expect(options.headers).toEqual({ accept: 'application/json' });
  for (const response of [new Response('x'.repeat(9000)), new Response('{broken'),
    new Response(JSON.stringify({ latest: '0.7.0-beta.1' })), new Response('blocked', { status: 403 })]) {
    fetchMock.mockResolvedValue(response);
    expect(await new UpdateChecker({ currentVersion: '0.6.2', cacheFile: await cacheFile(), enabled: true }).check()).toBeNull();
  }
});

it('supports opt-out and avoids both cache and network when disabled', async () => {
  for (const env of [{ GODOT_MCP_UPDATE_CHECK: '0' }, { CI: 'true' }, { VITEST: 'true' },
    { NO_UPDATE_NOTIFIER: '1' }, { npm_config_offline: 'true' }]) expect(updateChecksEnabled(env)).toBe(false);
  expect(updateChecksEnabled({ CI: 'false', npm_config_offline: 'false' })).toBe(true);
  const file = await cacheFile();
  const requestLatest = vi.fn();
  expect(await new UpdateChecker({ cacheFile: file, requestLatest, enabled: false }).check()).toBeNull();
  expect(requestLatest).not.toHaveBeenCalled();
  await expect(fs.stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('explains project, global and local npm updates without inserting project paths into shell commands', () => {
  const text = formatUpdateNotice({ currentVersion: '0.6.2', latestVersion: '0.6.3' }, 'C:/Games/My $project');
  expect(text).toContain('0.6.2 -> 0.6.3');
  expect(text).toContain('C:/Games/My $project');
  expect(text).toContain('npx --yes @srdarkx/godot-mcp@latest upgrade .');
  expect(text).toContain('npm install -g @srdarkx/godot-mcp@latest');
  expect(text).toContain('npm install @srdarkx/godot-mcp@latest');
  expect(text).toContain('npx --yes @srdarkx/godot-mcp@latest doctor .');
  expect(text).toContain('Reconnect');
});
