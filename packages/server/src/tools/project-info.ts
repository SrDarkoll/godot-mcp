import type { ProjectInfoResult } from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';

export async function getProjectInfo(rpc: Pick<RpcRouter, 'call'>): Promise<ProjectInfoResult> {
  return await rpc.call('project.info', {}) as ProjectInfoResult;
}
