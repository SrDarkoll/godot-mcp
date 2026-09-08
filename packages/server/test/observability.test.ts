import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { ToolPolicy } from '../src/security/tool-policy.js';
import { RecoveryService } from '../src/recovery/recovery-service.js';
import { SessionTelemetry } from '../src/session/telemetry.js';
import { exportSession } from '../src/session/session-export.js';
import { scanSessionStorage } from '../src/session/session-storage.js';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';

it('reports tool failures/storage and exports a retained metadata bundle without bridge credentials', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-observability-'));
  const session = createSession(root), sessions = new SessionStore(root);
  await sessions.create(session);
  await fs.mkdir(path.join(root, '.godot-mcp/runtime'), { recursive: true });
  await fs.writeFile(path.join(root, '.godot-mcp/runtime/bridge.json'), 'PRIVATE_BRIDGE_TOKEN');

  const recovery = new RecoveryService(session, sessions, { connected: false, rpc: { call: async () => ({}) } });
  const policy = new ToolPolicy(session, sessions, recovery);

  await policy.execute('session.status', {}, async () => ({}));
  await expect(policy.execute('project.info', {}, async () => {
    const error = new Error('Editor unavailable');
    (error as any).isError = true;
    throw error;
  })).rejects.toThrow();

  const metrics = await policy.metrics(1);
  expect(metrics.tools['project.info']).toMatchObject({ count: 1, failures: 1 });
  expect(metrics.tools['session.status']).toMatchObject({ count: 1, failures: 0 });
  expect(metrics.storage.quotaExceeded).toBe(true);
  expect(metrics.memory.rss).toBeGreaterThan(0);
  expect(metrics.queue).toHaveProperty('queued');

  const exported = await exportSession(sessions, session.id, metrics, {
    include_logs: false,
    include_screenshots: false,
    include_snapshots: false,
    max_bytes: 32 * 1024 * 1024,
  });

  const index = JSON.parse(await fs.readFile(path.join(exported.path, 'export.json'), 'utf8'));
  expect(index.complete).toBe(true);
  expect(index.files.map((f: any) => f.path).sort()).toEqual(['manifest.json', 'metrics.json']);
  for (const file of index.files) {
    const bytes = await fs.readFile(path.join(exported.path, file.path));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    expect(bytes.toString()).not.toContain('PRIVATE_BRIDGE_TOKEN');
  }
  expect(await fs.readFile(path.join(root, '.godot-mcp/runtime/bridge.json'), 'utf8')).toBe('PRIVATE_BRIDGE_TOKEN');
});

it('reports queued operations while a writer is held and bounds latency samples', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-queue-metrics-'));
  const session = createSession(root), sessions = new SessionStore(root);
  await sessions.create(session);
  const recovery = new RecoveryService(session, sessions, { connected: false, rpc: { call: async () => ({}) } });
  const policy = new ToolPolicy(session, sessions, recovery);

  let release!: () => void, started!: () => void;
  const blocked = new Promise<void>(r => release = r), began = new Promise<void>(r => started = r);
  const writer = policy.execute('node.create', {}, async () => { started(); await blocked; return {}; });
  await began;
  const reader = policy.execute('project.info', {}, async () => ({}));
  try {
    expect((await policy.metrics()).queue).toMatchObject({ writer: true, queued: 1 });
  } finally {
    release();
    await writer;
    await reader;
    await policy.close();
  }

  const telemetry = new SessionTelemetry();
  telemetry.connectionChanged(true);
  telemetry.connectionChanged(false);
  telemetry.connectionChanged(false);
  for (let i = 0; i < 300; i++) telemetry.record('session.status', i, 1, i % 2 === 0);
  expect(telemetry.snapshot()).toMatchObject({
    disconnects: 1,
    tools: { 'session.status': { count: 300, failures: 150, sampleSize: 128, maxMs: 299 } },
  });
});

it('requires explicit artifact inclusion and refuses over-budget exports without deleting originals', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-export-scope-'));
  const session = createSession(root), sessions = new SessionStore(root);
  await sessions.create(session);
  const dir = await sessions.ensureDirectory(session.id, 'logs/runtime');
  await fs.writeFile(path.join(dir, 'fixture.jsonl'), 'private log\n');
  const options = { include_logs: true, include_screenshots: false, include_snapshots: false, max_bytes: 1024 * 1024 };
  const result = await exportSession(sessions, session.id, {}, options);
  const index = JSON.parse(await fs.readFile(path.join(result.path, 'export.json'), 'utf8'));
  expect(index.files.map((f: any) => f.path)).toContain('logs/runtime/fixture.jsonl');
  await expect(exportSession(sessions, session.id, {}, { ...options, max_bytes: 1024 })).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE' });
  expect(await fs.readFile(path.join(dir, 'fixture.jsonl'), 'utf8')).toBe('private log\n');
});

it('retains an incomplete export with a discoverable path after a copy failure', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-export-failure-'));
  const session = createSession(root), sessions = new SessionStore(root);
  await sessions.create(session);
  const logs = await sessions.ensureDirectory(session.id, 'logs/runtime');
  await fs.writeFile(path.join(logs, 'fixture.jsonl'), 'retain original');
  const open = fs.open;
  const spy = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    if (String(args[0]).includes('export-') && String(args[0]).endsWith('fixture.jsonl')) throw new Error('Injected access failure');
    return open(...args);
  });
  let failure: any;
  try {
    await exportSession(sessions, session.id, {}, { include_logs: true, include_screenshots: false, include_snapshots: false, max_bytes: 1024 * 1024 });
  } catch (error) {
    failure = error;
  } finally {
    spy.mockRestore();
  }
  expect(failure).toMatchObject({ code: 'EXPORT_FAILED', details: { path: expect.any(String) } });
  const index = JSON.parse(await fs.readFile(path.join(failure.details.path, 'export.json'), 'utf8'));
  expect(index.complete).toBe(false);
  expect(index.files).toHaveLength(2);
  expect(await fs.readFile(path.join(logs, 'fixture.jsonl'), 'utf8')).toBe('retain original');
});

it('keeps metrics available when a temporary artifact disappears during inventory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-inventory-race-'));
  const session = createSession(root), sessions = new SessionStore(root);
  await sessions.create(session);
  const dir = await sessions.ensureDirectory(session.id, 'logs');
  await fs.writeFile(path.join(dir, 'transient.tmp'), 'temporary');
  const lstat = fs.lstat;
  const spy = vi.spyOn(fs, 'lstat').mockImplementation(async (...args) => {
    if (String(args[0]).endsWith('transient.tmp')) throw Object.assign(new Error('renamed'), { code: 'ENOENT' });
    return lstat(...args);
  });
  try {
    expect(await scanSessionStorage(sessions, session.id, 1024 ** 3)).toMatchObject({ changedDuringScan: 1 });
  } finally {
    spy.mockRestore();
  }
});
