import type {
  InputAddActionResult,
  InputListResult,
  InputRemoveActionResult,
  ProjectSettingGetResult,
  ProjectSettingSetResult,
} from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';

export interface ProjectSettingGetParams {
  setting: string;
}

export interface ProjectSettingSetParams {
  setting: string;
  value: unknown;
  save?: boolean | undefined;
}

export interface InputListParams {}

export interface InputAddActionParams {
  action: string;
  deadzone?: number | undefined;
  events?: Array<Record<string, unknown>> | undefined;
}

export interface InputRemoveActionParams {
  action: string;
}

export async function getProjectSetting(
  rpc: Pick<RpcRouter, 'call'>,
  params: ProjectSettingGetParams,
): Promise<ProjectSettingGetResult> {
  return (await rpc.call(
    'project.settings.get',
    params as unknown as Record<string, unknown>,
  )) as ProjectSettingGetResult;
}

export async function setProjectSetting(
  rpc: Pick<RpcRouter, 'call'>,
  params: ProjectSettingSetParams,
): Promise<ProjectSettingSetResult> {
  return (await rpc.call(
    'project.settings.set',
    params as unknown as Record<string, unknown>,
  )) as ProjectSettingSetResult;
}

export async function listInputActions(
  rpc: Pick<RpcRouter, 'call'>,
  params: InputListParams = {},
): Promise<InputListResult> {
  return (await rpc.call(
    'project.input.list',
    params as unknown as Record<string, unknown>,
  )) as InputListResult;
}

export async function addInputAction(
  rpc: Pick<RpcRouter, 'call'>,
  params: InputAddActionParams,
): Promise<InputAddActionResult> {
  return (await rpc.call(
    'project.input.add_action',
    params as unknown as Record<string, unknown>,
  )) as InputAddActionResult;
}

export async function removeInputAction(
  rpc: Pick<RpcRouter, 'call'>,
  params: InputRemoveActionParams,
): Promise<InputRemoveActionResult> {
  return (await rpc.call(
    'project.input.remove_action',
    params as unknown as Record<string, unknown>,
  )) as InputRemoveActionResult;
}
