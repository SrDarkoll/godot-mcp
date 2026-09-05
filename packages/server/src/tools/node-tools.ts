import type {
  NodeCreateResult,
  NodeDeleteResult,
  NodeDuplicateResult,
  NodeGetPropertiesResult,
  NodeGetPropertyResult,
  NodeInspectResult,
  NodeListChildrenResult,
  NodeMoveResult,
  NodeRenameResult,
  NodeReparentResult,
  NodeSetPropertyResult
} from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';

export interface NodeCreateParams {
  parent_path?: string | undefined;
  type: string;
  name?: string | undefined;
}

export interface NodeDeleteParams {
  node_path: string;
}

export interface NodeDuplicateParams {
  node_path: string;
  new_name?: string | undefined;
}

export interface NodeRenameParams {
  node_path: string;
  new_name: string;
}

export interface NodeReparentParams {
  node_path: string;
  new_parent_path: string;
  keep_global_transform?: boolean | undefined;
}

export interface NodeMoveParams {
  node_path: string;
  index: number;
}

export interface NodeInspectParams {
  node_path: string;
}

export interface NodeListChildrenParams {
  node_path?: string | undefined;
}

export interface NodeGetPropertyParams {
  node_path: string;
  property: string;
}

export interface NodeSetPropertyParams {
  node_path: string;
  property: string;
  value: unknown;
}

export interface NodeGetPropertiesParams {
  node_path: string;
  properties?: string[] | undefined;
}

export async function createNode(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeCreateParams
): Promise<NodeCreateResult> {
  return await rpc.call('node.create', params as unknown as Record<string, unknown>) as NodeCreateResult;
}

export async function deleteNode(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeDeleteParams
): Promise<NodeDeleteResult> {
  return await rpc.call('node.delete', params as unknown as Record<string, unknown>) as NodeDeleteResult;
}

export async function duplicateNode(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeDuplicateParams
): Promise<NodeDuplicateResult> {
  return await rpc.call('node.duplicate', params as unknown as Record<string, unknown>) as NodeDuplicateResult;
}

export async function renameNode(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeRenameParams
): Promise<NodeRenameResult> {
  return await rpc.call('node.rename', params as unknown as Record<string, unknown>) as NodeRenameResult;
}

export async function reparentNode(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeReparentParams
): Promise<NodeReparentResult> {
  return await rpc.call('node.reparent', params as unknown as Record<string, unknown>) as NodeReparentResult;
}

export async function moveNode(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeMoveParams
): Promise<NodeMoveResult> {
  return await rpc.call('node.move', params as unknown as Record<string, unknown>) as NodeMoveResult;
}

export async function inspectNode(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeInspectParams
): Promise<NodeInspectResult> {
  return await rpc.call('node.inspect', params as unknown as Record<string, unknown>) as NodeInspectResult;
}

export async function listNodeChildren(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeListChildrenParams = {}
): Promise<NodeListChildrenResult> {
  return await rpc.call('node.list_children', params as unknown as Record<string, unknown>) as NodeListChildrenResult;
}

export async function getNodeProperty(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeGetPropertyParams
): Promise<NodeGetPropertyResult> {
  return await rpc.call('node.get_property', params as unknown as Record<string, unknown>) as NodeGetPropertyResult;
}

export async function setNodeProperty(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeSetPropertyParams
): Promise<NodeSetPropertyResult> {
  return await rpc.call('node.set_property', params as unknown as Record<string, unknown>) as NodeSetPropertyResult;
}

export async function getNodeProperties(
  rpc: Pick<RpcRouter, 'call'>,
  params: NodeGetPropertiesParams
): Promise<NodeGetPropertiesResult> {
  return await rpc.call('node.get_properties', params as unknown as Record<string, unknown>) as NodeGetPropertiesResult;
}
