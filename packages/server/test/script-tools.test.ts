import { describe, expect, it, vi } from 'vitest';
import {
  createScript,
  attachScript,
  detachScript,
  inspectScript,
  validateScript
} from '../src/tools/script-tools.js';

describe('script tools', () => {
  const rpc = {
    call: vi.fn()
  };

  it('calls script.create', async () => {
    rpc.call.mockResolvedValueOnce({ path: 'res://scripts/player.gd', created: true });
    const result = await createScript(rpc as never, {
      path: 'res://scripts/player.gd',
      template: 'extends Node'
    });
    expect(result.created).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('script.create', {
      path: 'res://scripts/player.gd',
      template: 'extends Node'
    });
  });

  it('calls script.attach', async () => {
    rpc.call.mockResolvedValueOnce({
      node_path: '/Main/Player',
      script_path: 'res://scripts/player.gd',
      attached: true
    });
    const result = await attachScript(rpc as never, {
      node_path: '/Main/Player',
      script_path: 'res://scripts/player.gd'
    });
    expect(result.attached).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('script.attach', {
      node_path: '/Main/Player',
      script_path: 'res://scripts/player.gd'
    });
  });

  it('calls script.detach', async () => {
    rpc.call.mockResolvedValueOnce({
      node_path: '/Main/Player',
      detached: true
    });
    const result = await detachScript(rpc as never, { node_path: '/Main/Player' });
    expect(result.detached).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('script.detach', { node_path: '/Main/Player' });
  });

  it('calls script.inspect', async () => {
    rpc.call.mockResolvedValueOnce({
      path: 'res://scripts/player.gd',
      base_type: 'CharacterBody2D',
      methods: [{ name: '_ready', args: [], return_type: 'void' }],
      properties: [{ name: 'speed', type: 'float' }],
      signals: [{ name: 'jumped', args: [] }]
    });
    const result = await inspectScript(rpc as never, { path: 'res://scripts/player.gd' });
    expect(result.base_type).toBe('CharacterBody2D');
    expect(rpc.call).toHaveBeenCalledWith('script.inspect', { path: 'res://scripts/player.gd' });
  });

  it('calls script.validate', async () => {
    rpc.call.mockResolvedValueOnce({
      valid: true,
      errors: []
    });
    const result = await validateScript(rpc as never, { content: 'extends Node\n' });
    expect(result.valid).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('script.validate', { content: 'extends Node\n' });
  });
});
