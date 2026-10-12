import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SERVER_VERSION } from '@godot-mcp/protocol';

const PACKAGE_NAME = '@srdarkx/godot-mcp';
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@srdarkx%2fgodot-mcp/dist-tags';
const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const RESPONSE_LIMIT = 8 * 1024;
const CACHE_LIMIT = 2048;

export interface AvailableUpdate {
  currentVersion: string;
  latestVersion: string;
}
export interface UpdateCheck {
  check(): Promise<AvailableUpdate | null>;
  claimCliNotice?(update: AvailableUpdate): Promise<boolean>;
}
interface CachedCheck {
  schema: 1;
  packageName: string;
  checkedAt: number;
  latest: string | null;
  failed: boolean;
  lastNotice?: { currentVersion: string; latestVersion: string; shownAt: number };
}
export interface UpdateCheckerOptions {
  currentVersion?: string;
  cacheFile?: string;
  enabled?: boolean;
  now?: () => number;
  timeoutMs?: number;
  requestLatest?: (signal: AbortSignal) => Promise<string | null>;
}

function release(version: string): { numbers: number[]; prerelease: boolean } | null {
  if (version.length > 100) return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*))*))?(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?$/.exec(version);
  if (!match) return null;
  const numbers = match.slice(1, 4).map(Number);
  return numbers.every(Number.isSafeInteger) ? { numbers, prerelease: match[4] !== undefined } : null;
}

export function isNewerStableRelease(latest: string, current: string): boolean {
  const next = release(latest);
  const installed = release(current);
  if (!next || next.prerelease || !installed) return false;
  for (let i = 0; i < 3; i++) {
    if (next.numbers[i] !== installed.numbers[i]) return next.numbers[i]! > installed.numbers[i]!;
  }
  return installed.prerelease;
}

export function updateChecksEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const on = (value: string | undefined) => !!value && !/^(0|false|no)$/i.test(value);
  return env.GODOT_MCP_UPDATE_CHECK !== '0' && !on(env.CI) && !on(env.VITEST) &&
    !on(env.NO_UPDATE_NOTIFIER) && !on(env.npm_config_offline);
}

export function updateCacheFile(env: NodeJS.ProcessEnv = process.env): string {
  const base = process.platform === 'win32' ? env.LOCALAPPDATA : env.XDG_CACHE_HOME;
  return path.join(base && path.isAbsolute(base) ? base : path.join(os.homedir(), '.cache'), 'godot-mcp', 'update-check.json');
}

async function requestLatest(signal: AbortSignal): Promise<string | null> {
  const response = await fetch(DIST_TAGS_URL, {
    signal, redirect: 'error', credentials: 'omit', headers: { accept: 'application/json' }
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > RESPONSE_LIMIT) return null;
      chunks.push(chunk.value);
    }
    const tags: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return tags && typeof tags === 'object' && 'latest' in tags && typeof tags.latest === 'string' ? tags.latest : null;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function readCache(file: string, now: number): Promise<CachedCheck | null> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > CACHE_LIMIT) return null;
    handle = await fs.open(file, 'r');
    const buffer = Buffer.alloc(CACHE_LIMIT + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > CACHE_LIMIT) return null;
    const cached = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) as Partial<CachedCheck> | null;
    if (!cached || cached.schema !== 1 || cached.packageName !== PACKAGE_NAME ||
      typeof cached.checkedAt !== 'number' || !Number.isFinite(cached.checkedAt) || cached.checkedAt < 0 || cached.checkedAt > now ||
      typeof cached.failed !== 'boolean' || (cached.latest !== null && (typeof cached.latest !== 'string' || !release(cached.latest) || release(cached.latest)!.prerelease))) return null;
    const notice = cached.lastNotice;
    if (notice !== undefined && (typeof notice !== 'object' || notice === null ||
      typeof notice.currentVersion !== 'string' || !release(notice.currentVersion) ||
      typeof notice.latestVersion !== 'string' || !release(notice.latestVersion) ||
      typeof notice.shownAt !== 'number' || !Number.isFinite(notice.shownAt) || notice.shownAt < 0 || notice.shownAt > now)) delete cached.lastNotice;
    return cached as CachedCheck;
  } catch { return null; }
  finally { await handle?.close().catch(() => {}); }
}

async function writeCache(file: string, cached: CachedCheck): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(cached), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } catch { /* Cache access must never prevent a command from completing. */ }
  finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}

export class UpdateChecker implements UpdateCheck {
  private cached: CachedCheck | null = null;
  private loaded = false;
  private pending: Promise<AvailableUpdate | null> | null = null;
  private readonly version: string;
  private readonly file: string;
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly request: (signal: AbortSignal) => Promise<string | null>;
  private readonly timeoutMs: number;

  constructor(options: UpdateCheckerOptions = {}) {
    this.version = options.currentVersion ?? SERVER_VERSION;
    this.file = options.cacheFile ?? updateCacheFile();
    this.enabled = options.enabled ?? updateChecksEnabled();
    this.now = options.now ?? Date.now;
    this.request = options.requestLatest ?? requestLatest;
    this.timeoutMs = options.timeoutMs ?? 1000;
  }

  check(): Promise<AvailableUpdate | null> {
    if (!this.enabled) return Promise.resolve(null);
    if (!this.pending) this.pending = this.loadAndCheck().catch(() => null).finally(() => { this.pending = null; });
    return this.pending;
  }

  async claimCliNotice(update: AvailableUpdate): Promise<boolean> {
    if (!this.enabled || !this.cached) return false;
    const previous = this.cached.lastNotice;
    const now = this.now();
    if (previous?.currentVersion === update.currentVersion && previous.latestVersion === update.latestVersion &&
      now >= previous.shownAt && now - previous.shownAt < DAY_MS) return false;
    this.cached.lastNotice = { ...update, shownAt: now };
    await writeCache(this.file, this.cached);
    return true;
  }

  private async loadAndCheck(): Promise<AvailableUpdate | null> {
    if (!this.loaded) {
      this.cached = await readCache(this.file, this.now());
      this.loaded = true;
    }
    const now = this.now();
    if (!this.cached || now < this.cached.checkedAt || now - this.cached.checkedAt >= (this.cached.failed ? RETRY_MS : DAY_MS)) {
      const latest = await this.boundedRequest();
      const parsed = latest === null ? null : release(latest);
      this.cached = { schema: 1, packageName: PACKAGE_NAME, checkedAt: this.now(),
        latest: parsed && !parsed.prerelease ? latest : null, failed: !parsed || parsed.prerelease,
        ...(this.cached?.lastNotice ? { lastNotice: this.cached.lastNotice } : {}) };
      await writeCache(this.file, this.cached);
    }
    return this.cached.latest && isNewerStableRelease(this.cached.latest, this.version) ?
      { currentVersion: this.version, latestVersion: this.cached.latest } : null;
  }

  private async boundedRequest(): Promise<string | null> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => this.request(controller.signal)).catch(() => null),
        new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, this.timeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  }
}

export function formatUpdateNotice(update: AvailableUpdate, projectRoot?: string): string {
  return [
    `Godot MCP update available: ${update.currentVersion} -> ${update.latestVersion}`,
    projectRoot ? `Update this Godot project from its folder (${JSON.stringify(projectRoot)}):` : 'Update each Godot project from its folder:',
    '  npx --yes @srdarkx/godot-mcp@latest upgrade .',
    'This updates the addon and recognized project-local Codex launcher, with backup and verification.',
    'If the CLI is installed globally, also update that npm installation:',
    '  npm install -g @srdarkx/godot-mcp@latest',
    'If it is a local dependency, run this in the folder containing its package.json:',
    '  npm install @srdarkx/godot-mcp@latest',
    'With npx, @latest already selects the new package; no global installation is needed.',
    'Reconnect your MCP client and reload the Godot addon after upgrading. Verify from the project folder:',
    '  npx --yes @srdarkx/godot-mcp@latest doctor .'
  ].join('\n');
}
