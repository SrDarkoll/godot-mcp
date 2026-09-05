import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface BridgeDescriptorInput {
  port: number;
  token: string;
  sessionId: string;
}

export function createBridgeToken(): string {
  return randomBytes(32).toString('hex');
}

export class BridgeDescriptorStore {
  readonly descriptorPath: string;
  private readonly tempPath: string;

  constructor(private readonly projectRoot: string) {
    const runtimeDir = path.join(projectRoot, '.godot-mcp', 'runtime');
    this.descriptorPath = path.join(runtimeDir, 'bridge.json');
    this.tempPath = path.join(runtimeDir, 'bridge.json.tmp');
  }

  async write(input: BridgeDescriptorInput): Promise<void> {
    await mkdir(path.dirname(this.descriptorPath), { recursive: true });
    const descriptor = {
      sessionId: input.sessionId,
      host: '127.0.0.1',
      port: input.port,
      token: input.token,
      pid: process.pid,
      protocol: 1
    };
    await writeFile(this.tempPath, `${JSON.stringify(descriptor, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(this.tempPath, this.descriptorPath);
  }

  async remove(): Promise<void> {
    await rm(this.tempPath, { force: true });
    await rm(this.descriptorPath, { force: true });
  }
}
