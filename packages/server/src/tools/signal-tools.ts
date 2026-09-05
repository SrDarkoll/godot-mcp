import type {
  SignalConnectResult,
  SignalConnectionsResult,
  SignalDisconnectResult,
  SignalListResult
} from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';

export interface SignalListParams {
  node_path: string;
}

export interface SignalConnectionsParams {
  node_path: string;
  signal_name?: string | undefined;
}

export interface SignalConnectParams {
  source_node_path: string;
  signal_name: string;
  target_node_path: string;
  target_method: string;
  flags?: number | undefined;
}

export interface SignalDisconnectParams {
  source_node_path: string;
  signal_name: string;
  target_node_path: string;
  target_method: string;
}

export async function listSignals(
  rpc: Pick<RpcRouter, 'call'>,
  params: SignalListParams
): Promise<SignalListResult> {
  return await rpc.call('signal.list', params as unknown as Record<string, unknown>) as SignalListResult;
}

export async function getSignalConnections(
  rpc: Pick<RpcRouter, 'call'>,
  params: SignalConnectionsParams
): Promise<SignalConnectionsResult> {
  return await rpc.call('signal.connections', params as unknown as Record<string, unknown>) as SignalConnectionsResult;
}

export async function connectSignal(
  rpc: Pick<RpcRouter, 'call'>,
  params: SignalConnectParams
): Promise<SignalConnectResult> {
  return await rpc.call('signal.connect', params as unknown as Record<string, unknown>) as SignalConnectResult;
}

export async function disconnectSignal(
  rpc: Pick<RpcRouter, 'call'>,
  params: SignalDisconnectParams
): Promise<SignalDisconnectResult> {
  return await rpc.call('signal.disconnect', params as unknown as Record<string, unknown>) as SignalDisconnectResult;
}
