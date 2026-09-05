import type {
  ResourceCreateResult,
  ResourceDuplicateResult,
  ResourceInspectResult,
  ResourceLoadResult,
  ResourceSaveResult,
  ResourceSetPropertyResult
} from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';

export interface ResourceLoadParams {
  path: string;
  type_hint?: string | undefined;
}

export interface ResourceInspectParams {
  path: string;
}

export interface ResourceCreateParams {
  type: string;
  path: string;
  properties?: Record<string, unknown> | undefined;
}

export interface ResourceSetPropertyParams {
  path: string;
  property: string;
  value: unknown;
}

export interface ResourceSaveParams {
  path: string;
  flags?: number | undefined;
}

export interface ResourceDuplicateParams {
  source_path: string;
  target_path: string;
  subresources?: boolean | undefined;
}

export async function loadResource(
  rpc: Pick<RpcRouter, 'call'>,
  params: ResourceLoadParams
): Promise<ResourceLoadResult> {
  return await rpc.call('resource.load', params as unknown as Record<string, unknown>) as ResourceLoadResult;
}

export async function inspectResource(
  rpc: Pick<RpcRouter, 'call'>,
  params: ResourceInspectParams
): Promise<ResourceInspectResult> {
  return await rpc.call('resource.inspect', params as unknown as Record<string, unknown>) as ResourceInspectResult;
}

export async function createResource(
  rpc: Pick<RpcRouter, 'call'>,
  params: ResourceCreateParams
): Promise<ResourceCreateResult> {
  return await rpc.call('resource.create', params as unknown as Record<string, unknown>) as ResourceCreateResult;
}

export async function setResourceProperty(
  rpc: Pick<RpcRouter, 'call'>,
  params: ResourceSetPropertyParams
): Promise<ResourceSetPropertyResult> {
  return await rpc.call('resource.set_property', params as unknown as Record<string, unknown>) as ResourceSetPropertyResult;
}

export async function saveResource(
  rpc: Pick<RpcRouter, 'call'>,
  params: ResourceSaveParams
): Promise<ResourceSaveResult> {
  return await rpc.call('resource.save', params as unknown as Record<string, unknown>) as ResourceSaveResult;
}

export async function duplicateResource(
  rpc: Pick<RpcRouter, 'call'>,
  params: ResourceDuplicateParams
): Promise<ResourceDuplicateResult> {
  return await rpc.call('resource.duplicate', params as unknown as Record<string, unknown>) as ResourceDuplicateResult;
}
