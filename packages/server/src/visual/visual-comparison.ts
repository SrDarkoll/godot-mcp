import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync, deflateSync } from 'node:zlib';
import type { Session } from '../session/session.js';
import type { SessionStore } from '../session/session-store.js';
import { BridgeRpcError } from '../bridge/rpc-router.js';

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type),
    out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}
function encodePng(width: number, height: number, pixels: Buffer) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y++)
    rows.push(
      Buffer.concat([Buffer.from([0]), pixels.subarray(y * width * 4, (y + 1) * width * 4)]),
    );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
function decodePng(bytes: Buffer) {
  const fail = (): never => {
    throw new BridgeRpcError('SCREENSHOT_CORRUPT', 'Screenshot PNG cannot be decoded safely');
  };
  if (
    bytes.length < 45 ||
    bytes.length > 16 * 1024 * 1024 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    fail();
  let offset = 8,
    width = 0,
    height = 0,
    type = -1,
    depth = 0,
    interlace = 0;
  const idat: Buffer[] = [];
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset),
      name = bytes.toString('ascii', offset + 4, offset + 8);
    if (length > bytes.length - offset - 12) fail();
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (
      crc32(bytes.subarray(offset + 4, offset + 8 + length)) !==
      bytes.readUInt32BE(offset + 8 + length)
    )
      fail();
    if (offset === 8) {
      if (name !== 'IHDR' || length !== 13) fail();
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8]!;
      type = data[9]!;
      if (data[10] !== 0 || data[11] !== 0) fail();
      interlace = data[12]!;
    } else if (name === 'IHDR') fail();
    if (name === 'IDAT') idat.push(data);
    offset += length + 12;
    if (name === 'IEND') {
      if (length !== 0) fail();
      ended = true;
      break;
    }
  }
  if (
    !ended ||
    offset !== bytes.length ||
    !idat.length ||
    depth !== 8 ||
    interlace !== 0 ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    ![0, 2, 4, 6].includes(type)
  )
    fail();
  const channels = type === 0 ? 1 : type === 2 ? 3 : type === 4 ? 2 : 4,
    rowBytes = width * channels,
    expected = (rowBytes + 1) * height;
  if (expected > 80 * 1024 * 1024) fail();
  let packed: Buffer;
  try {
    packed = inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
  } catch {
    return fail();
  }
  if (packed.length !== expected) fail();
  const raw = Buffer.alloc(rowBytes * height);
  let source = 0;
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = packed[source++]!;
    if (filter > 4) fail();
    for (let x = 0; x < rowBytes; x++) {
      const value = packed[source++]!,
        left = x >= channels ? raw[y * rowBytes + x - channels]! : 0,
        up = y ? raw[(y - 1) * rowBytes + x]! : 0,
        upperLeft = y && x >= channels ? raw[(y - 1) * rowBytes + x - channels]! : 0;
      raw[y * rowBytes + x] =
        (value +
          (filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : filter === 4
                  ? paeth(left, up, upperLeft)
                  : 0)) &
        255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < raw.length; i += channels, j += 4) {
    if (type === 0) {
      rgba[j] = rgba[j + 1] = rgba[j + 2] = raw[i]!;
      rgba[j + 3] = 255;
    } else if (type === 2) {
      rgba[j] = raw[i]!;
      rgba[j + 1] = raw[i + 1]!;
      rgba[j + 2] = raw[i + 2]!;
      rgba[j + 3] = 255;
    } else if (type === 4) {
      rgba[j] = rgba[j + 1] = rgba[j + 2] = raw[i]!;
      rgba[j + 3] = raw[i + 1]!;
    } else raw.copy(rgba, j, i, i + 4);
  }
  return { width, height, rgba };
}
async function atomicJson(directory: string, name: string, value: unknown) {
  const temporary = path.join(directory, `${name}-${randomUUID()}.tmp`),
    target = path.join(directory, name);
  const handle = await fs.open(temporary, 'wx');
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temporary, target);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}
type ScreenshotRef = { sessionId: string; screenshotId: string };
interface Sample {
  sampledAt: string;
  fps: number;
  frameTimeMs: number | null;
  nodeCount: number;
  objectCount: number;
}
export class VisualComparisonService {
  constructor(
    private readonly session: Session,
    private readonly sessions: SessionStore,
    private readonly sampler?: () => Promise<Sample>,
  ) {}
  private async screenshot(reference: ScreenshotRef) {
    const manifest = await this.sessions.read(reference.sessionId),
      record = manifest.screenshots.find((item) => item.id === reference.screenshotId);
    if (!record)
      throw new BridgeRpcError(
        'SCREENSHOT_NOT_FOUND',
        'Screenshot is not present in the requested session',
      );
    const file = path.join(
      this.sessions.sessionDir(reference.sessionId),
      ...record.path.split('/'),
    );
    const stat = await fs.lstat(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.size !== record.byteLength
    )
      throw new BridgeRpcError('SCREENSHOT_CORRUPT', 'Screenshot artifact changed');
    const bytes = await fs.readFile(file);
    if (createHash('sha256').update(bytes).digest('hex') !== record.sha256)
      throw new BridgeRpcError('SCREENSHOT_CORRUPT', 'Screenshot checksum changed');
    return { record, image: decodePng(bytes) };
  }
  async compare(input: {
    baseline: ScreenshotRef;
    candidate: ScreenshotRef;
    pixelThreshold: number;
    maxChangedPixelRatio: number;
  }) {
    const baseline = await this.screenshot(input.baseline),
      candidate = await this.screenshot(input.candidate);
    if (
      baseline.image.width !== candidate.image.width ||
      baseline.image.height !== candidate.image.height
    )
      throw new BridgeRpcError('IMAGE_SIZE_MISMATCH', 'Screenshots must have identical dimensions');
    const pixels = baseline.image.width * baseline.image.height,
      diff = Buffer.alloc(pixels * 4);
    let changed = 0,
      total = 0,
      max = 0;
    for (let i = 0; i < pixels; i++) {
      let pixelMax = 0;
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(
          baseline.image.rgba[i * 4 + channel]! - candidate.image.rgba[i * 4 + channel]!,
        );
        pixelMax = Math.max(pixelMax, delta);
        total += delta;
        max = Math.max(max, delta);
      }
      const different = pixelMax > input.pixelThreshold;
      if (different) changed++;
      diff[i * 4] = different ? 255 : 0;
      diff[i * 4 + 1] = different ? 0 : baseline.image.rgba[i * 4]! >> 2;
      diff[i * 4 + 2] = different ? 0 : baseline.image.rgba[i * 4 + 1]! >> 2;
      diff[i * 4 + 3] = 255;
    }
    const id = randomUUID(),
      artifactPath = await this.sessions.ensureDirectory(
        this.session.id,
        `artifacts/visual-comparison-${id}`,
      ),
      diffBytes = encodePng(baseline.image.width, baseline.image.height, diff),
      diffPath = path.join(artifactPath, 'diff.png');
    const handle = await fs.open(diffPath, 'wx');
    try {
      await handle.writeFile(diffBytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const result = {
      id,
      sessionId: this.session.id,
      complete: true,
      passed: changed / pixels <= input.maxChangedPixelRatio,
      width: baseline.image.width,
      height: baseline.image.height,
      totalPixels: pixels,
      changedPixels: changed,
      changedPixelRatio: changed / pixels,
      meanChannelDelta: total / (pixels * 4),
      maxChannelDelta: max,
      pixelThreshold: input.pixelThreshold,
      maxChangedPixelRatio: input.maxChangedPixelRatio,
      baseline: input.baseline,
      candidate: input.candidate,
      diffPath,
      diffSha256: createHash('sha256').update(diffBytes).digest('hex'),
      artifactPath,
    };
    await atomicJson(artifactPath, 'comparison.json', result);
    return result;
  }
  async performanceSnapshot(input: { samples: number; intervalMs: number; label: string }) {
    if (!this.sampler)
      throw new BridgeRpcError('RUNTIME_UNAVAILABLE', 'Performance sampling is unavailable');
    const values: Sample[] = [];
    for (let i = 0; i < input.samples; i++) {
      const sample=await this.sampler();
      if(!Number.isFinite(sample.fps)||sample.fps<0||!Number.isFinite(sample.nodeCount)||sample.nodeCount<0||!Number.isFinite(sample.objectCount)||sample.objectCount<0||(sample.frameTimeMs!==null&&(!Number.isFinite(sample.frameTimeMs)||sample.frameTimeMs<0))||!Number.isFinite(Date.parse(sample.sampledAt)))throw new BridgeRpcError('PERFORMANCE_SAMPLE_INVALID','Runtime returned a malformed performance sample');
      values.push(sample);
      if (i + 1 < input.samples && input.intervalMs)
        await new Promise((resolve) => setTimeout(resolve, input.intervalMs));
    }
    const average = (key: 'fps' | 'nodeCount' | 'objectCount') =>
        values.reduce((n, v) => n + v[key], 0) / values.length,
      frame = values.filter((v) => v.frameTimeMs !== null);
    const id = randomUUID(),
      artifactPath = await this.sessions.ensureDirectory(
        this.session.id,
        `artifacts/performance-${id}`,
      );
    const result = {
      version: 1,
      id,
      sessionId: this.session.id,
      label: input.label,
      createdAt: new Date().toISOString(),
      sampleCount: values.length,
      intervalMs: input.intervalMs,
      summary: {
        fps: average('fps'),
        frameTimeMs: frame.length
          ? frame.reduce((n, v) => n + v.frameTimeMs!, 0) / frame.length
          : null,
        nodeCount: average('nodeCount'),
        objectCount: average('objectCount'),
      },
      samples: values,
      artifactPath,
    };
    await atomicJson(artifactPath, 'snapshot.json', result);
    return result;
  }
  private async performance(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new BridgeRpcError('INVALID_ARGUMENT', 'Invalid performance snapshot id');
    const directory = await this.sessions.ensureDirectory(
        this.session.id,
        `artifacts/performance-${id}`,
      ),
      file = path.join(directory, 'snapshot.json'),
      stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024 * 1024)
      throw new BridgeRpcError('PERFORMANCE_SNAPSHOT_CORRUPT', 'Invalid performance snapshot');
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (
      value.id !== id ||
      value.sessionId !== this.session.id ||
      value.version !== 1 ||
      !value.summary
    )
      throw new BridgeRpcError(
        'PERFORMANCE_SNAPSHOT_CORRUPT',
        'Performance snapshot identity changed',
      );
    return value;
  }
  async comparePerformance(input: {
    baselineId: string;
    candidateId: string;
    budgets: {
      maxFpsDropRatio: number;
      maxFrameTimeIncreaseRatio: number;
      maxNodeIncreaseRatio: number;
      maxObjectIncreaseRatio: number;
    };
  }) {
    const baseline = await this.performance(input.baselineId),
      candidate = await this.performance(input.candidateId),
      ratio = (a: number | null, b: number | null, direction: 'drop' | 'increase') =>
        a === null || b === null || a === 0
          ? null
          : direction === 'drop'
            ? (a - b) / a
            : (b - a) / a;
    const observed = {
      fps: ratio(baseline.summary.fps, candidate.summary.fps, 'drop'),
      frameTimeMs: ratio(baseline.summary.frameTimeMs, candidate.summary.frameTimeMs, 'increase'),
      nodeCount: ratio(baseline.summary.nodeCount, candidate.summary.nodeCount, 'increase'),
      objectCount: ratio(baseline.summary.objectCount, candidate.summary.objectCount, 'increase'),
    };
    const zeroBaselineRegressions=new Set<string>();
    if(baseline.summary.frameTimeMs===0&&candidate.summary.frameTimeMs>0)zeroBaselineRegressions.add('frameTimeMs');
    if(baseline.summary.nodeCount===0&&candidate.summary.nodeCount>0)zeroBaselineRegressions.add('nodeCount');
    if(baseline.summary.objectCount===0&&candidate.summary.objectCount>0)zeroBaselineRegressions.add('objectCount');
    const limits = {
        fps: input.budgets.maxFpsDropRatio,
        frameTimeMs: input.budgets.maxFrameTimeIncreaseRatio,
        nodeCount: input.budgets.maxNodeIncreaseRatio,
        objectCount: input.budgets.maxObjectIncreaseRatio,
      },
      violations = Object.keys(observed).filter(
        (key) =>
          zeroBaselineRegressions.has(key)||(observed[key as keyof typeof observed] !== null &&
          observed[key as keyof typeof observed]! > limits[key as keyof typeof limits]),
      );
    const id = randomUUID(),
      artifactPath = await this.sessions.ensureDirectory(
        this.session.id,
        `artifacts/performance-comparison-${id}`,
      ),
      result = {
        id,
        sessionId: this.session.id,
        mode: 'relative',
        passed: violations.length === 0,
        violations,
        observed,
        zeroBaselineRegressions:[...zeroBaselineRegressions],
        limits,
        baseline,
        candidate,
        artifactPath,
      };
    await atomicJson(artifactPath, 'comparison.json', result);
    return result;
  }
}
