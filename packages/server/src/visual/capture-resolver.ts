import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CaptureReferenceSchema, CaptureResultSchema, type CaptureResult } from '@godot-mcp/protocol';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import type { SessionStore } from '../session/session-store.js';
import { readSessionManifest } from '../session/session-reader.js';

export class CaptureResolver {
  constructor(private readonly sessions: SessionStore) {}

  async resolve(reference: string): Promise<CaptureResult> {
    if (!CaptureReferenceSchema.safeParse(reference).success)
      throw new BridgeRpcError('INVALID_ARGUMENT', 'Invalid capture reference');
    const [sessionId, screenshotId] = reference.split('/') as [string, string];
    let manifest;
    try {
      manifest = await readSessionManifest(this.sessions.projectRoot, sessionId);
    } catch {
      throw new BridgeRpcError('SCREENSHOT_CORRUPT', 'Capture session manifest is unavailable or invalid');
    }
    const screenshot = manifest.screenshots.find(item => item.id === screenshotId);
    if (!screenshot)
      throw new BridgeRpcError('SCREENSHOT_NOT_FOUND', 'Capture is not in the retained session');

    let current = this.sessions.sessionDir(sessionId);
    const parts = screenshot.path.split('/');
    for (const part of parts.slice(0, -1)) {
      current = path.join(current, part);
      const directory = await fs.lstat(current).catch(() => null);
      if (!directory?.isDirectory() || directory.isSymbolicLink())
        throw new BridgeRpcError('SCREENSHOT_CORRUPT', 'Capture directory changed');
    }
    const absolutePath = path.join(current, parts.at(-1)!);
    const stat = await fs.lstat(absolutePath).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== screenshot.byteLength)
      throw new BridgeRpcError('SCREENSHOT_CORRUPT', 'Capture artifact changed');
    const bytes = await fs.readFile(absolutePath);
    if (bytes.length !== screenshot.byteLength ||
        createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256)
      throw new BridgeRpcError('SCREENSHOT_CORRUPT', 'Capture checksum changed');
    const checkpoint = manifest.checkpoints.find(item => item.kind === 'visual' && item.screenshotId === screenshotId) ?? null;
    return CaptureResultSchema.parse({ sessionId, screenshot, checkpoint, captureRef: reference, absolutePath });
  }
}
