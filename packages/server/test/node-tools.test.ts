import { describe, expect, it, vi } from 'vitest';
import {
  createNode,
  deleteNode,
  duplicateNode,
  renameNode,
  reparentNode,
  moveNode,
  inspectNode,
  listNodeChildren,
  getNodeProperty,
  setNodeProperty,
  getNodeProperties
} from '../src/tools/node-tools.js';

describe('node tools', () => {
  const rpc = {
    call: vi.fn()
  };

  it('calls node.create', async () => {
    rpc.call.mockResolvedValueOnce({
      name: 'Sprite',
      type: 'Sprite2D',
      path: '/Main/Sprite'
    });
    const result = await createNode(rpc as never, {
      parent_path: '/Main',
      type: 'Sprite2D',
      name: 'Sprite'
    });
    expect(result).toEqual({
      name: 'Sprite',
      type: 'Sprite2D',
      path: '/Main/Sprite'
    });
    expect(rpc.call).toHaveBeenCalledWith('node.create', {
      parent_path: '/Main',
      type: 'Sprite2D',
      name: 'Sprite'
    });
  });

  it('calls node.delete', async () => {
    rpc.call.mockResolvedValueOnce({ path: '/Main/Sprite', deleted: true });
    const result = await deleteNode(rpc as never, { node_path: '/Main/Sprite' });
    expect(result).toEqual({ path: '/Main/Sprite', deleted: true });
    expect(rpc.call).toHaveBeenCalledWith('node.delete', { node_path: '/Main/Sprite' });
  });

  it('calls node.duplicate', async () => {
    rpc.call.mockResolvedValueOnce({
      name: 'Sprite2',
      type: 'Sprite2D',
      path: '/Main/Sprite2'
    });
    const result = await duplicateNode(rpc as never, {
      node_path: '/Main/Sprite',
      new_name: 'Sprite2'
    });
    expect(result.name).toBe('Sprite2');
    expect(rpc.call).toHaveBeenCalledWith('node.duplicate', {
      node_path: '/Main/Sprite',
      new_name: 'Sprite2'
    });
  });

  it('calls node.rename', async () => {
    rpc.call.mockResolvedValueOnce({
      old_path: '/Main/Sprite',
      new_path: '/Main/PlayerSprite',
      name: 'PlayerSprite'
    });
    const result = await renameNode(rpc as never, {
      node_path: '/Main/Sprite',
      new_name: 'PlayerSprite'
    });
    expect(result.name).toBe('PlayerSprite');
    expect(rpc.call).toHaveBeenCalledWith('node.rename', {
      node_path: '/Main/Sprite',
      new_name: 'PlayerSprite'
    });
  });

  it('calls node.reparent', async () => {
    rpc.call.mockResolvedValueOnce({
      old_path: '/Main/Sprite',
      new_path: '/Main/Container/Sprite'
    });
    const result = await reparentNode(rpc as never, {
      node_path: '/Main/Sprite',
      new_parent_path: '/Main/Container',
      keep_global_transform: true
    });
    expect(result.new_path).toBe('/Main/Container/Sprite');
    expect(rpc.call).toHaveBeenCalledWith('node.reparent', {
      node_path: '/Main/Sprite',
      new_parent_path: '/Main/Container',
      keep_global_transform: true
    });
  });

  it('calls node.move', async () => {
    rpc.call.mockResolvedValueOnce({ path: '/Main/Sprite', index: 0 });
    const result = await moveNode(rpc as never, { node_path: '/Main/Sprite', index: 0 });
    expect(result.index).toBe(0);
    expect(rpc.call).toHaveBeenCalledWith('node.move', { node_path: '/Main/Sprite', index: 0 });
  });

  it('calls node.inspect', async () => {
    rpc.call.mockResolvedValueOnce({
      name: 'Main',
      type: 'Node2D',
      path: '/Main',
      scene_file_path: 'res://main.tscn',
      script: null,
      groups: [],
      children_count: 1,
      properties: { position: { x: 0, y: 0 } }
    });
    const result = await inspectNode(rpc as never, { node_path: '/Main' });
    expect(result.name).toBe('Main');
    expect(result.children_count).toBe(1);
    expect(rpc.call).toHaveBeenCalledWith('node.inspect', { node_path: '/Main' });
  });

  it('calls node.list_children', async () => {
    rpc.call.mockResolvedValueOnce({
      node_path: '/Main',
      children: [{ name: 'Sprite', type: 'Sprite2D', path: '/Main/Sprite' }]
    });
    const result = await listNodeChildren(rpc as never, { node_path: '/Main' });
    expect(result.children).toHaveLength(1);
    expect(rpc.call).toHaveBeenCalledWith('node.list_children', { node_path: '/Main' });
  });

  it('calls node.get_property', async () => {
    rpc.call.mockResolvedValueOnce({ property: 'position', value: { x: 10, y: 20 } });
    const result = await getNodeProperty(rpc as never, { node_path: '/Main', property: 'position' });
    expect(result.property).toBe('position');
    expect(rpc.call).toHaveBeenCalledWith('node.get_property', { node_path: '/Main', property: 'position' });
  });

  it('calls node.set_property', async () => {
    rpc.call.mockResolvedValueOnce({
      property: 'position',
      previous_value: { x: 0, y: 0 },
      new_value: { x: 10, y: 20 }
    });
    const result = await setNodeProperty(rpc as never, {
      node_path: '/Main',
      property: 'position',
      value: { x: 10, y: 20 }
    });
    expect(result.property).toBe('position');
    expect(rpc.call).toHaveBeenCalledWith('node.set_property', {
      node_path: '/Main',
      property: 'position',
      value: { x: 10, y: 20 }
    });
  });

  it('calls node.get_properties', async () => {
    rpc.call.mockResolvedValueOnce({ properties: { position: { x: 0, y: 0 } } });
    const result = await getNodeProperties(rpc as never, { node_path: '/Main' });
    expect(result.properties).toHaveProperty('position');
    expect(rpc.call).toHaveBeenCalledWith('node.get_properties', { node_path: '/Main' });
  });
});
