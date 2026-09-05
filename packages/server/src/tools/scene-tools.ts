import type {
  SceneCreateResult,
  SceneGetRootResult,
  SceneInstantiateResult,
  SceneOpenResult,
  SceneReloadResult,
  SceneSaveResult
} from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';

export interface SceneCreateParams {
  root_type: string;
  root_name?: string | undefined;
  path?: string | undefined;
}

export interface SceneOpenParams {
  path: string;
}

export interface SceneSaveParams {
  path?: string | undefined;
}

export interface SceneSaveAsParams {
  path: string;
}

export interface SceneReloadParams {
  path?: string | undefined;
}

export interface SceneInstantiateParams {
  path: string;
  parent_path?: string | undefined;
  name?: string | undefined;
}

export interface SceneGetRootParams {}

export async function createScene(
  rpc: Pick<RpcRouter, 'call'>,
  params: SceneCreateParams
): Promise<SceneCreateResult> {
  return await rpc.call('scene.create', params as unknown as Record<string, unknown>) as SceneCreateResult;
}

export async function openScene(
  rpc: Pick<RpcRouter, 'call'>,
  params: SceneOpenParams
): Promise<SceneOpenResult> {
  return await rpc.call('scene.open', params as unknown as Record<string, unknown>) as SceneOpenResult;
}

export async function saveScene(
  rpc: Pick<RpcRouter, 'call'>,
  params: SceneSaveParams = {}
): Promise<SceneSaveResult> {
  return await rpc.call('scene.save', params as unknown as Record<string, unknown>) as SceneSaveResult;
}

export async function saveSceneAs(
  rpc: Pick<RpcRouter, 'call'>,
  params: SceneSaveAsParams
): Promise<SceneSaveResult> {
  return await rpc.call('scene.save_as', params as unknown as Record<string, unknown>) as SceneSaveResult;
}

export async function reloadScene(
  rpc: Pick<RpcRouter, 'call'>,
  params: SceneReloadParams = {}
): Promise<SceneReloadResult> {
  return await rpc.call('scene.reload', params as unknown as Record<string, unknown>) as SceneReloadResult;
}

export async function instantiateScene(
  rpc: Pick<RpcRouter, 'call'>,
  params: SceneInstantiateParams
): Promise<SceneInstantiateResult> {
  return await rpc.call('scene.instantiate', params as unknown as Record<string, unknown>) as SceneInstantiateResult;
}

export async function getSceneRoot(
  rpc: Pick<RpcRouter, 'call'>,
  params: SceneGetRootParams = {}
): Promise<SceneGetRootResult> {
  return await rpc.call('scene.get_root', params as unknown as Record<string, unknown>) as SceneGetRootResult;
}
