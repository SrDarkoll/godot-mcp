import type { SceneTreeResult } from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';

export async function getSceneTree(rpc: Pick<RpcRouter, 'call'>): Promise<SceneTreeResult> {
  return await rpc.call('scene.get_tree', {}) as SceneTreeResult;
}
