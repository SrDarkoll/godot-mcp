import type { RecoveryRecord } from '@godot-mcp/protocol';
import { BridgeRpcError, type RpcRouter } from '../bridge/rpc-router.js';
import type { ProjectFiles } from './project-files.js';
export interface RecoveryBridge {
  connected: boolean;
  rpc: Pick<RpcRouter, 'call'>;
}

export class RecoveryValidator {
  constructor(
    private readonly files: ProjectFiles,
    private readonly bridge: RecoveryBridge,
  ) {}
  async prepare(paths: string[]): Promise<void> {
    if (!this.bridge.connected) return;
    if (paths.some((p) => p.toLowerCase() === 'res://project.godot'))
      throw new BridgeRpcError(
        'EDITOR_MUST_BE_CLOSED',
        'Project settings restoration requires a closed editor',
      );
    const response = (await this.bridge.rpc.call('recovery.prepare', { paths })) as {
      ready: boolean;
    };
    if (!response.ready)
      throw new BridgeRpcError('EDITOR_STATE_CONFLICT', 'Affected editors must be closed');
  }
  requireAvailable(record: RecoveryRecord): void {
    for (const entry of record.after) {
      if (!entry.exists) continue;
      const native = /\.(gd|tscn|tres)$/.test(entry.path);
      if (!entry.path.endsWith('.json') && (!native || !this.bridge.connected))
        throw new BridgeRpcError('VALIDATION_UNAVAILABLE', `Cannot validate ${entry.path}`);
    }
  }
  async validate(record: RecoveryRecord): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const native: string[] = [];
    for (const entry of record.after) {
      if (!entry.exists) continue;
      if (entry.path.endsWith('.json')) {
        try {
          JSON.parse((await this.files.read(entry.path))!.toString('utf8'));
        } catch {
          errors.push(`Invalid JSON: ${entry.path}`);
        }
      } else native.push(entry.path);
    }
    if (native.length) {
      const result = (await this.bridge.rpc.call(
        'recovery.validate',
        { paths: native },
        15000,
      )) as { valid: boolean; errors: string[] };
      errors.push(...result.errors);
      if (!result.valid && !result.errors.length) errors.push('Godot validation failed');
    }
    return { valid: errors.length === 0, errors };
  }
}
