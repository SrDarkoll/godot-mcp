import type {
  EditorActiveSceneResult,
  EditorChangeSceneResult,
  EditorFilesystemResult,
  EditorOpenScenesResult,
  EditorScanFilesystemResult,
  EditorSelectedNodesResult,
  EditorSelectNodeResult,
  EditorUndoRedoResult,
} from '@godot-mcp/protocol';
import type { RpcRouter } from '../bridge/rpc-router.js';

export interface EditorGetActiveSceneParams {}

export interface EditorGetOpenScenesParams {}

export interface EditorGetSelectedNodesParams {}

export interface EditorSelectNodeParams {
  node_path: string;
  additive?: boolean | undefined;
}

export interface EditorChangeSceneParams {
  path: string;
}

export interface EditorUndoParams {}

export interface EditorRedoParams {}

export interface EditorGetFilesystemParams {}

export interface EditorScanFilesystemParams {}

export async function getActiveScene(
  rpc: Pick<RpcRouter, 'call'>,
  params: EditorGetActiveSceneParams = {},
): Promise<EditorActiveSceneResult> {
  return (await rpc.call(
    'editor.get_active_scene',
    params as unknown as Record<string, unknown>,
  )) as EditorActiveSceneResult;
}

export async function getOpenScenes(
  rpc: Pick<RpcRouter, 'call'>,
  params: EditorGetOpenScenesParams = {},
): Promise<EditorOpenScenesResult> {
  return (await rpc.call(
    'editor.get_open_scenes',
    params as unknown as Record<string, unknown>,
  )) as EditorOpenScenesResult;
}

export async function getSelectedNodes(
  rpc: Pick<RpcRouter, 'call'>,
  params: EditorGetSelectedNodesParams = {},
): Promise<EditorSelectedNodesResult> {
  return (await rpc.call(
    'editor.get_selected_nodes',
    params as unknown as Record<string, unknown>,
  )) as EditorSelectedNodesResult;
}

export async function selectNode(
  rpc: Pick<RpcRouter, 'call'>,
  params: EditorSelectNodeParams,
): Promise<EditorSelectNodeResult> {
  return (await rpc.call(
    'editor.select_node',
    params as unknown as Record<string, unknown>,
  )) as EditorSelectNodeResult;
}

export async function changeScene(
  rpc: Pick<RpcRouter, 'call'>,
  params: EditorChangeSceneParams,
): Promise<EditorChangeSceneResult> {
  return (await rpc.call(
    'editor.change_scene',
    params as unknown as Record<string, unknown>,
  )) as EditorChangeSceneResult;
}

export async function editorUndo(
  rpc: Pick<RpcRouter, 'call'>,
  params: EditorUndoParams = {},
): Promise<EditorUndoRedoResult> {
  return (await rpc.call(
    'editor.undo',
    params as unknown as Record<string, unknown>,
  )) as EditorUndoRedoResult;
}

export async function editorRedo(
  rpc: Pick<RpcRouter, 'call'>,
  params: EditorRedoParams = {},
): Promise<EditorUndoRedoResult> {
  return (await rpc.call(
    'editor.redo',
    params as unknown as Record<string, unknown>,
  )) as EditorUndoRedoResult;
}

export async function getFilesystem(
  rpc: Pick<RpcRouter, 'call'>,
  params: EditorGetFilesystemParams = {},
): Promise<EditorFilesystemResult> {
  return (await rpc.call(
    'editor.get_filesystem',
    params as unknown as Record<string, unknown>,
  )) as EditorFilesystemResult;
}

export async function scanFilesystem(
  rpc: Pick<RpcRouter, 'call'>,
  params: EditorScanFilesystemParams = {},
): Promise<EditorScanFilesystemResult> {
  return (await rpc.call(
    'editor.scan_filesystem',
    params as unknown as Record<string, unknown>,
  )) as EditorScanFilesystemResult;
}
