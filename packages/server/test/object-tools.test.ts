import { describe, expect, it, vi } from 'vitest';
import {
  getObjectClass,
  getObjectPropertyList,
  getObjectMethodList,
  getObjectSignalList,
  getObjectProperty,
  setObjectProperty,
  callObjectMethod
} from '../src/tools/object-tools.js';

describe('object tools', () => {
  const rpc = {
    call: vi.fn()
  };

  it('calls object.get_class', async () => {
    rpc.call.mockResolvedValueOnce({ class: 'CharacterBody2D' });
    const result = await getObjectClass(rpc as never, { node_path: 'Player' });
    expect(result).toEqual({ class: 'CharacterBody2D' });
    expect(rpc.call).toHaveBeenCalledWith('object.get_class', { node_path: 'Player' });
  });

  it('calls object.get_property_list', async () => {
    rpc.call.mockResolvedValueOnce({ properties: [{ name: 'position', type: 'Vector2' }] });
    const result = await getObjectPropertyList(rpc as never, { node_path: 'Player' });
    expect(result.properties).toHaveLength(1);
    expect(rpc.call).toHaveBeenCalledWith('object.get_property_list', { node_path: 'Player' });
  });

  it('calls object.get_method_list', async () => {
    rpc.call.mockResolvedValueOnce({ methods: [{ name: 'move_and_slide' }] });
    const result = await getObjectMethodList(rpc as never, { node_path: 'Player' });
    expect(result.methods).toHaveLength(1);
  });

  it('calls object.get_signal_list', async () => {
    rpc.call.mockResolvedValueOnce({ signals: [{ name: 'tree_entered' }] });
    const result = await getObjectSignalList(rpc as never, { node_path: 'Player' });
    expect(result.signals).toHaveLength(1);
  });

  it('calls object.get', async () => {
    rpc.call.mockResolvedValueOnce({ property: 'position', value: { type: 'Vector2', value: { x: 10, y: 20 } } });
    const result = await getObjectProperty(rpc as never, { node_path: 'Player', property: 'position' });
    expect(result.property).toBe('position');
  });

  it('calls object.set', async () => {
    rpc.call.mockResolvedValueOnce({
      property: 'position',
      previous_value: { type: 'Vector2', value: { x: 0, y: 0 } },
      new_value: { type: 'Vector2', value: { x: 10, y: 20 } }
    });
    const result = await setObjectProperty(rpc as never, {
      node_path: 'Player',
      property: 'position',
      value: { type: 'Vector2', value: { x: 10, y: 20 } }
    });
    expect(result.property).toBe('position');
  });

  it('calls object.call', async () => {
    rpc.call.mockResolvedValueOnce({ result: { type: 'bool', value: true } });
    const result = await callObjectMethod(rpc as never, {
      node_path: 'Player',
      method: 'is_on_floor',
      args: []
    });
    expect(result.result).toEqual({ type: 'bool', value: true });
  });
});