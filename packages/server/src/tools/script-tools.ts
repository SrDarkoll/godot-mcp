import type {
  ScriptAttachResult,
  ScriptCreateResult,
  ScriptDetachResult,
  ScriptInspectResult,
  ScriptValidateResult
} from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';

export interface ScriptCreateParams {
  path: string;
  template?: string | undefined;
  inherits?: string | undefined;
}

export interface ScriptAttachParams {
  node_path: string;
  script_path: string;
}

export interface ScriptDetachParams {
  node_path: string;
}

export interface ScriptInspectParams {
  path?: string | undefined;
  node_path?: string | undefined;
}

export interface ScriptValidateParams {
  content: string;
  path?: string | undefined;
}

export async function createScript(
  rpc: Pick<RpcRouter, 'call'>,
  params: ScriptCreateParams
): Promise<ScriptCreateResult> {
  return await rpc.call('script.create', params as unknown as Record<string, unknown>) as ScriptCreateResult;
}

export async function attachScript(
  rpc: Pick<RpcRouter, 'call'>,
  params: ScriptAttachParams
): Promise<ScriptAttachResult> {
  return await rpc.call('script.attach', params as unknown as Record<string, unknown>) as ScriptAttachResult;
}

export async function detachScript(
  rpc: Pick<RpcRouter, 'call'>,
  params: ScriptDetachParams
): Promise<ScriptDetachResult> {
  return await rpc.call('script.detach', params as unknown as Record<string, unknown>) as ScriptDetachResult;
}

export async function inspectScript(
  rpc: Pick<RpcRouter, 'call'>,
  params: ScriptInspectParams
): Promise<ScriptInspectResult> {
  return await rpc.call('script.inspect', params as unknown as Record<string, unknown>) as ScriptInspectResult;
}

export async function validateScript(
  rpc: Pick<RpcRouter, 'call'>,
  params: ScriptValidateParams
): Promise<ScriptValidateResult> {
  return await rpc.call('script.validate', params as unknown as Record<string, unknown>) as ScriptValidateResult;
}
