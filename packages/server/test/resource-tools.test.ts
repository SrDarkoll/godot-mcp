import { describe, expect, it, vi } from 'vitest';
import {
  loadResource,
  inspectResource,
  createResource,
  setResourceProperty,
  saveResource,
  duplicateResource
} from '../src/tools/resource-tools.js';

describe('resource tools', () => {
  const rpc = {
    call: vi.fn()
  };

  it('calls resource.load', async () => {
    rpc.call.mockResolvedValueOnce({
      path: 'res://test.tres',
      type: 'StandardMaterial3D',
      properties: { roughness: 0.5 }
    });
    const result = await loadResource(rpc as never, { path: 'res://test.tres' });
    expect(result.type).toBe('StandardMaterial3D');
    expect(rpc.call).toHaveBeenCalledWith('resource.load', { path: 'res://test.tres' });
  });

  it('calls resource.inspect', async () => {
    rpc.call.mockResolvedValueOnce({
      path: 'res://test.tres',
      type: 'StandardMaterial3D',
      properties: { roughness: 0.5 }
    });
    const result = await inspectResource(rpc as never, { path: 'res://test.tres' });
    expect(result.properties).toHaveProperty('roughness');
    expect(rpc.call).toHaveBeenCalledWith('resource.inspect', { path: 'res://test.tres' });
  });

  it('calls resource.create', async () => {
    rpc.call.mockResolvedValueOnce({
      path: 'res://test.tres',
      type: 'StandardMaterial3D'
    });
    const result = await createResource(rpc as never, {
      type: 'StandardMaterial3D',
      path: 'res://test.tres',
      properties: { roughness: 0.5 }
    });
    expect(result.type).toBe('StandardMaterial3D');
    expect(rpc.call).toHaveBeenCalledWith('resource.create', {
      type: 'StandardMaterial3D',
      path: 'res://test.tres',
      properties: { roughness: 0.5 }
    });
  });

  it('calls resource.set_property', async () => {
    rpc.call.mockResolvedValueOnce({
      path: 'res://test.tres',
      property: 'roughness',
      previous_value: 0.5,
      new_value: 0.8
    });
    const result = await setResourceProperty(rpc as never, {
      path: 'res://test.tres',
      property: 'roughness',
      value: 0.8
    });
    expect(result.property).toBe('roughness');
    expect(rpc.call).toHaveBeenCalledWith('resource.set_property', {
      path: 'res://test.tres',
      property: 'roughness',
      value: 0.8
    });
  });

  it('calls resource.save', async () => {
    rpc.call.mockResolvedValueOnce({ path: 'res://test.tres', saved: true });
    const result = await saveResource(rpc as never, { path: 'res://test.tres' });
    expect(result.saved).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('resource.save', { path: 'res://test.tres' });
  });

  it('calls resource.duplicate', async () => {
    rpc.call.mockResolvedValueOnce({
      path: 'res://copy.tres',
      type: 'StandardMaterial3D'
    });
    const result = await duplicateResource(rpc as never, {
      source_path: 'res://test.tres',
      target_path: 'res://copy.tres',
      subresources: true
    });
    expect(result.path).toBe('res://copy.tres');
    expect(rpc.call).toHaveBeenCalledWith('resource.duplicate', {
      source_path: 'res://test.tres',
      target_path: 'res://copy.tres',
      subresources: true
    });
  });
});
