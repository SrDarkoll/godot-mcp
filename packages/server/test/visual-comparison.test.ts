import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';
import { VisualComparisonService } from '../src/visual/visual-comparison.js';

const crcTable = Uint32Array.from({ length: 256 }, (_, v) => {
  let c = v;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => {
  let c = 0xffffffff;
  for (const v of b) c = crcTable[(c ^ v) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (name: string, data: Buffer) => {
  const t = Buffer.from(name),
    out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  t.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc(Buffer.concat([t, data])), 8 + data.length);
  return out;
};
function png(width: number, height: number, pixels: number[]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y++)
    rows.push(Buffer.from([0, ...pixels.slice(y * width * 4, (y + 1) * width * 4)]));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-visual-compare-'));
  const session = createSession(root),
    sessions = new SessionStore(root);
  await sessions.create(session);
  return { root, session, sessions };
}
async function add(
  sessions: SessionStore,
  id: string,
  screenshotId: string,
  name: string,
  bytes: Buffer,
  width = 2,
  height = 1,
) {
  const dir = await sessions.ensureDirectory(id, 'screenshots/editor'),
    relative = 'screenshots/editor/' + name;
  await fs.writeFile(path.join(dir, name), bytes);
  await sessions.update(id, (m) => ({
    ...m,
    nextScreenshotSequence: m.nextScreenshotSequence + 1,
    screenshots: [
      ...m.screenshots,
      {
        id: screenshotId,
        sequence: m.nextScreenshotSequence,
        type: 'editor_2d',
        runId: null,
        path: relative,
        scene: null,
        reason: 'manual_request',
        label: name,
        transaction: null,
        timestamp: new Date().toISOString(),
        width,
        height,
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        viewportIndex: null,
      },
    ],
  }));
}
it('compares retained PNG pixels deterministically and keeps hashed diff evidence', async () => {
  const { session, sessions } = await setup(),
    service = new VisualComparisonService(session, sessions);
  const baseline = '123e4567-e89b-42d3-a456-426614174001',
    candidate = '123e4567-e89b-42d3-a456-426614174002';
  await add(
    sessions,
    session.id,
    baseline,
    '0001_base.png',
    png(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]),
  );
  await add(
    sessions,
    session.id,
    candidate,
    '0002_candidate.png',
    png(2, 1, [0, 0, 0, 255, 255, 0, 255, 255]),
  );
  const result = await service.compare({
    baseline: { sessionId: session.id, screenshotId: baseline },
    candidate: { sessionId: session.id, screenshotId: candidate },
    pixelThreshold: 10,
    maxChangedPixelRatio: 0.4,
  });
  expect(result).toMatchObject({
    passed: false,
    width: 2,
    height: 1,
    changedPixels: 1,
    changedPixelRatio: 0.5,
    maxChannelDelta: 255,
  });
  const report = JSON.parse(
    await fs.readFile(path.join(result.artifactPath, 'comparison.json'), 'utf8'),
  );
  expect(report).toMatchObject({ complete: true, passed: false });
  const diff = await fs.readFile(path.join(result.artifactPath, 'diff.png'));
  expect(createHash('sha256').update(diff).digest('hex')).toBe(report.diffSha256);
  const same = await service.compare({
    baseline: { sessionId: session.id, screenshotId: baseline },
    candidate: { sessionId: session.id, screenshotId: baseline },
    pixelThreshold: 0,
    maxChangedPixelRatio: 0,
  });
  expect(same.passed).toBe(true);
  await fs.writeFile(
    path.join(sessions.sessionDir(session.id), 'screenshots/editor/0002_candidate.png'),
    'corrupt',
  );
  await expect(
    service.compare({
      baseline: { sessionId: session.id, screenshotId: baseline },
      candidate: { sessionId: session.id, screenshotId: candidate },
      pixelThreshold: 0,
      maxChangedPixelRatio: 1,
    }),
  ).rejects.toMatchObject({ code: 'SCREENSHOT_CORRUPT' });
});
it('rejects unsupported PNG encodings and dimension mismatches before writing evidence', async () => {
  const { session, sessions } = await setup(),
    service = new VisualComparisonService(session, sessions);
  const base = '123e4567-e89b-42d3-a456-426614174011',
    unsupported = '123e4567-e89b-42d3-a456-426614174012',
    small = '123e4567-e89b-42d3-a456-426614174013';
  const valid = png(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]),
    bad = Buffer.from(valid);
  bad[25] = 3;
  bad.writeUInt32BE(crc(bad.subarray(12, 29)), 29);
  await add(sessions, session.id, base, '0011_base.png', valid);
  await add(sessions, session.id, unsupported, '0012_palette.png', bad);
  await add(sessions, session.id, small, '0013_small.png', png(1, 1, [0, 0, 0, 255]), 1, 1);
  await expect(
    service.compare({
      baseline: { sessionId: session.id, screenshotId: base },
      candidate: { sessionId: session.id, screenshotId: unsupported },
      pixelThreshold: 0,
      maxChangedPixelRatio: 1,
    }),
  ).rejects.toMatchObject({ code: 'SCREENSHOT_CORRUPT' });
  await expect(
    service.compare({
      baseline: { sessionId: session.id, screenshotId: base },
      candidate: { sessionId: session.id, screenshotId: small },
      pixelThreshold: 0,
      maxChangedPixelRatio: 1,
    }),
  ).rejects.toMatchObject({ code: 'IMAGE_SIZE_MISMATCH' });
  expect(await fs.readdir(path.join(sessions.sessionDir(session.id), 'artifacts'))).toEqual([]);
});
it('retains relative performance samples and evaluates user-provided regression ratios', async () => {
  const { session, sessions } = await setup();
  let current = { fps: 60, frameTimeMs: 16, nodeCount: 100, objectCount: 200 };
  const service = new VisualComparisonService(session, sessions, async () => ({
    ...current,
    sampledAt: new Date().toISOString(),
  }));
  const base = await service.performanceSnapshot({ samples: 3, intervalMs: 0, label: 'base' });
  current = { fps: 45, frameTimeMs: 22, nodeCount: 120, objectCount: 260 };
  const next = await service.performanceSnapshot({ samples: 3, intervalMs: 0, label: 'candidate' });
  const comparison = await service.comparePerformance({
    baselineId: base.id,
    candidateId: next.id,
    budgets: {
      maxFpsDropRatio: 0.1,
      maxFrameTimeIncreaseRatio: 0.2,
      maxNodeIncreaseRatio: 0.3,
      maxObjectIncreaseRatio: 0.2,
    },
  });
  expect(comparison.passed).toBe(false);
  expect(comparison.violations).toEqual(
    expect.arrayContaining(['fps', 'frameTimeMs', 'objectCount']),
  );
  expect(comparison.mode).toBe('relative');
  expect(comparison.baseline.sampleCount).toBe(3);
  current = { fps: 60, frameTimeMs: 16, nodeCount: 0, objectCount: 0 };
  const zero = await service.performanceSnapshot({ samples: 1, intervalMs: 0, label: 'zero' });
  current = { fps: 60, frameTimeMs: 16, nodeCount: 1, objectCount: 1 };
  const nonzero = await service.performanceSnapshot({samples:1,intervalMs:0,label:'nonzero'});
  const fromZero=await service.comparePerformance({baselineId:zero.id,candidateId:nonzero.id,budgets:{maxFpsDropRatio:0,maxFrameTimeIncreaseRatio:0,maxNodeIncreaseRatio:10,maxObjectIncreaseRatio:10}});
  expect(fromZero.passed).toBe(false);
  expect(fromZero.violations).toEqual(['nodeCount','objectCount']);
  expect(fromZero.observed.nodeCount).toBeNull();
  current={fps:Number.NaN,frameTimeMs:16,nodeCount:1,objectCount:1};
  await expect(service.performanceSnapshot({samples:1,intervalMs:0,label:'invalid'})).rejects.toMatchObject({code:'PERFORMANCE_SAMPLE_INVALID'});
});
