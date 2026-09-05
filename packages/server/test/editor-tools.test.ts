import { describe, expect, it, vi } from 'vitest';
import {
  getActiveScene,
  getOpenScenes,
  getSelectedNodes,
  selectNode,
  changeScene,
  editorUndo,
  editorRedo,
  getFilesystem,
  scanFilesystem
} from '../src/tools/editor-tools.js';

describe('editor control tools', () => {
  const rpc = {
    call: vi.fn()
  };

  it('calls editor.get_active_scene', async () => {
    rpc.call.mockResolvedValueOnce({
      path: 'res://main.tscn',
      root_name: 'Main',
      root_type: 'Node2D'
    });
    const result = await getActiveScene(rpc as never, {});
    expect(result.path).toBe('res://main.tscn');
    expect(rpc.call).toHaveBeenCalledWith('editor.get_active_scene', {});
  });

  it('calls editor.get_open_scenes', async () => {
    rpc.call.mockResolvedValueOnce({
      scenes: ['res://main.tscn', 'res://player.tscn']
    });
    const result = await getOpenScenes(rpc as never, {});
    expect(result.scenes).toHaveLength(2);
    expect(rpc.call).toHaveBeenCalledWith('editor.get_open_scenes', {});
  });

  it('calls editor.get_selected_nodes', async () => {
    rpc.call.mockResolvedValueOnce({
      nodes: [{ name: 'Player', type: 'CharacterBody2D', path: '/Main/Player' }]
    });
    const result = await getSelectedNodes(rpc as never, {});
    expect(result.nodes).toHaveLength(1);
    expect(rpc.call).toHaveBeenCalledWith('editor.get_selected_nodes', {});
  });

  it('calls editor.select_node', async () => {
    rpc.call.mockResolvedValueOnce({
      node_path: '/Main/Player',
      selected: true
    });
    const result = await selectNode(rpc as never, { node_path: '/Main/Player', additive: false });
    expect(result.selected).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('editor.select_node', {
      node_path: '/Main/Player',
      additive: false
    });
  });

  it('calls editor.change_scene', async () => {
    rpc.call.mockResolvedValueOnce({
      path: 'res://player.tscn',
      switched: true
    });
    const result = await changeScene(rpc as never, { path: 'res://player.tscn' });
    expect(result.switched).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('editor.change_scene', { path: 'res://player.tscn' });
  });

  it('calls editor.undo', async () => {
    rpc.call.mockResolvedValueOnce({ performed: true });
    const result = await editorUndo(rpc as never, {});
    expect(result.performed).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('editor.undo', {});
  });

  it('calls editor.redo', async () => {
    rpc.call.mockResolvedValueOnce({ performed: true });
    const result = await editorRedo(rpc as never, {});
    expect(result.performed).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('editor.redo', {});
  });

  it('calls editor.get_filesystem', async () => {
    rpc.call.mockResolvedValueOnce({
      root: { path: 'res://', name: 'res://', is_dir: true, files: [], subdirectories: [] }
    });
    const result = await getFilesystem(rpc as never, {});
    expect(result.root).toHaveProperty('is_dir', true);
    expect(rpc.call).toHaveBeenCalledWith('editor.get_filesystem', {});
  });

  it('calls editor.scan_filesystem', async () => {
    rpc.call.mockResolvedValueOnce({ scanned: true });
    const result = await scanFilesystem(rpc as never, {});
    expect(result.scanned).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('editor.scan_filesystem', {});
  });
});
