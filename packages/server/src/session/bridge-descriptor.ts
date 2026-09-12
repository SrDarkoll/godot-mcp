import { randomBytes,randomUUID } from 'node:crypto';
import { rename, rm, writeFile,readFile } from 'node:fs/promises';
import {secureDirectory} from '../recovery/project-files.js';
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
  private ownerSessionId:string|null=null;

  constructor(private readonly projectRoot: string) {
    const runtimeDir = path.join(projectRoot, '.godot-mcp', 'runtime');
    this.descriptorPath = path.join(runtimeDir, 'bridge.json');
    this.tempPath = path.join(runtimeDir, `bridge-${randomUUID()}.tmp`);
  }

  async write(input: BridgeDescriptorInput): Promise<void> {
    await secureDirectory(this.projectRoot,['.godot-mcp','runtime']);
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
    this.ownerSessionId=input.sessionId;
  }

  async remove(): Promise<void> {
    await rm(this.tempPath, { force: true });
    try{const current=JSON.parse(await readFile(this.descriptorPath,'utf8'));if(current.sessionId===this.ownerSessionId&&current.pid===process.pid)await rm(this.descriptorPath,{force:true});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
}
