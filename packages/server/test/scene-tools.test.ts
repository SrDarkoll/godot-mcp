import { describe, expect, it, vi } from 'vitest';
import {
  createScene,
  openScene,
  saveScene,
  saveSceneAs,
  reloadScene,
  instantiateScene,
  getSceneRoot
} from '../src/tools/scene-tools.js';

describe('scene tools', () => {
  const rpc = {
    call: vi.fn()
  };

  it('calls scene.create', async () => {
    rpc.call.mockResolvedValueOnce({
      path: 'res://scenes/test.tscn',
      root_name: 'Main',
      root_type: 'Node2D'
    });
    const result = await createScene(rpc as never, {
      root_type: 'Node2D',
      root_name: 'Main',
      path: 'res://scenes/test.tscn'
    });
    expect(result).toEqual({
      path: 'res://scenes/test.tscn',
      root_name: 'Main',
      root_type: 'Node2D'
    });
    expect(rpc.call).toHaveBeenCalledWith('scene.create', {
      root_type: 'Node2D',
      root_name: 'Main',
      path: 'res://scenes/test.tscn'
    });
  });

  it('calls scene.open', async () => {
    rpc.call.mockResolvedValueOnce({
      path: 'res://scenes/test.tscn',
      root_name: 'Main',
      root_type: 'Node2D'
    });
    const result = await openScene(rpc as never, { path: 'res://scenes/test.tscn' });
    expect(result.path).toBe('res://scenes/test.tscn');
    expect(rpc.call).toHaveBeenCalledWith('scene.open', { path: 'res://scenes/test.tscn' });
  });

  it('calls scene.save', async () => {
    rpc.call.mockResolvedValueOnce({ path: 'res://scenes/test.tscn', saved: true });
    const result = await saveScene(rpc as never, {});
    expect(result).toEqual({ path: 'res://scenes/test.tscn', saved: true });
    expect(rpc.call).toHaveBeenCalledWith('scene.save', {});
  });

  it('calls scene.save_as', async () => {
    rpc.call.mockResolvedValueOnce({ path: 'res://scenes/copy.tscn', saved: true });
    const result = await saveSceneAs(rpc as never, { path: 'res://scenes/copy.tscn' });
    expect(result).toEqual({ path: 'res://scenes/copy.tscn', saved: true });
    expect(rpc.call).toHaveBeenCalledWith('scene.save_as', { path: 'res://scenes/copy.tscn' });
  });

  it('calls scene.reload', async () => {
    rpc.call.mockResolvedValueOnce({ path: 'res://scenes/test.tscn', reloaded: true });
    const result = await reloadScene(rpc as never, { path: 'res://scenes/test.tscn' });
    expect(result).toEqual({ path: 'res://scenes/test.tscn', reloaded: true });
    expect(rpc.call).toHaveBeenCalledWith('scene.reload', { path: 'res://scenes/test.tscn' });
  });

  it('calls scene.instantiate', async () => {
    rpc.call.mockResolvedValueOnce({
      name: 'Enemy',
      type: 'CharacterBody2D',
      path: '/Main/Enemy',
      scene_file_path: 'res://scenes/enemy.tscn'
    });
    const result = await instantiateScene(rpc as never, {
      path: 'res://scenes/enemy.tscn',
      parent_path: '/Main',
      name: 'Enemy'
    });
    expect(result.name).toBe('Enemy');
    expect(rpc.call).toHaveBeenCalledWith('scene.instantiate', {
      path: 'res://scenes/enemy.tscn',
      parent_path: '/Main',
      name: 'Enemy'
    });
  });

  it('calls scene.get_root', async () => {
    rpc.call.mockResolvedValueOnce({
      name: 'Main',
      type: 'Node2D',
      path: '/Main',
      scene_file_path: 'res://scenes/test.tscn'
    });
    const result = await getSceneRoot(rpc as never, {});
    expect(result).toEqual({
      name: 'Main',
      type: 'Node2D',
      path: '/Main',
      scene_file_path: 'res://scenes/test.tscn'
    });
    expect(rpc.call).toHaveBeenCalledWith('scene.get_root', {});
  });
});
