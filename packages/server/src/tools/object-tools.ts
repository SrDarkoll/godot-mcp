import type {
  ObjectCallResult,
  ObjectClassResult,
  ObjectGetResult,
  ObjectMethodListResult,
  ObjectPropertyListResult,
  ObjectSetResult,
  ObjectSignalListResult,
  ObjectTargetParams
} from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';

export async function getObjectClass(
  rpc: Pick<RpcRouter, 'call'>,
  params: ObjectTargetParams
): Promise<ObjectClassResult> {
  return await rpc.call('object.get_class', params as unknown as Record<string, unknown>) as ObjectClassResult;
}

export async function getObjectPropertyList(
  rpc: Pick<RpcRouter, 'call'>,
  params: ObjectTargetParams
): Promise<ObjectPropertyListResult> {
  return await rpc.call('object.get_property_list', params as unknown as Record<string, unknown>) as ObjectPropertyListResult;
}

export async function getObjectMethodList(
  rpc: Pick<RpcRouter, 'call'>,
  params: ObjectTargetParams
): Promise<ObjectMethodListResult> {
  return await rpc.call('object.get_method_list', params as unknown as Record<string, unknown>) as ObjectMethodListResult;
}

export async function getObjectSignalList(
  rpc: Pick<RpcRouter, 'call'>,
  params: ObjectTargetParams
): Promise<ObjectSignalListResult> {
  return await rpc.call('object.get_signal_list', params as unknown as Record<string, unknown>) as ObjectSignalListResult;
}

export async function getObjectProperty(
  rpc: Pick<RpcRouter, 'call'>,
  params: ObjectTargetParams & { property: string }
): Promise<ObjectGetResult> {
  return await rpc.call('object.get', params as unknown as Record<string, unknown>) as ObjectGetResult;
}

export async function setObjectProperty(
  rpc: Pick<RpcRouter, 'call'>,
  params: ObjectTargetParams & { property: string; value: unknown }
): Promise<ObjectSetResult> {
  return await rpc.call('object.set', params as unknown as Record<string, unknown>) as ObjectSetResult;
}

export async function callObjectMethod(
  rpc: Pick<RpcRouter, 'call'>,
  params: ObjectTargetParams & { method: string; args?: unknown[] | undefined }
): Promise<ObjectCallResult> {
  return await rpc.call('object.call', params as unknown as Record<string, unknown>) as ObjectCallResult;
}