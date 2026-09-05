import { describe, expect, it, vi } from 'vitest';
import {
  listSignals,
  getSignalConnections,
  connectSignal,
  disconnectSignal
} from '../src/tools/signal-tools.js';

describe('signal tools', () => {
  const rpc = {
    call: vi.fn()
  };

  it('calls signal.list', async () => {
    rpc.call.mockResolvedValueOnce({
      node_path: '/Main/Button',
      signals: [{ name: 'pressed', args: [] }]
    });
    const result = await listSignals(rpc as never, { node_path: '/Main/Button' });
    expect(result.signals).toHaveLength(1);
    expect(rpc.call).toHaveBeenCalledWith('signal.list', { node_path: '/Main/Button' });
  });

  it('calls signal.connections', async () => {
    rpc.call.mockResolvedValueOnce({
      node_path: '/Main/Button',
      connections: [{
        signal: 'pressed',
        target_path: '/Main',
        method: '_on_button_pressed',
        flags: 1
      }]
    });
    const result = await getSignalConnections(rpc as never, {
      node_path: '/Main/Button',
      signal_name: 'pressed'
    });
    expect(result.connections).toHaveLength(1);
    expect(rpc.call).toHaveBeenCalledWith('signal.connections', {
      node_path: '/Main/Button',
      signal_name: 'pressed'
    });
  });

  it('calls signal.connect', async () => {
    rpc.call.mockResolvedValueOnce({
      connected: true,
      source_node_path: '/Main/Button',
      signal_name: 'pressed',
      target_node_path: '/Main',
      target_method: '_on_button_pressed'
    });
    const result = await connectSignal(rpc as never, {
      source_node_path: '/Main/Button',
      signal_name: 'pressed',
      target_node_path: '/Main',
      target_method: '_on_button_pressed',
      flags: 1
    });
    expect(result.connected).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('signal.connect', {
      source_node_path: '/Main/Button',
      signal_name: 'pressed',
      target_node_path: '/Main',
      target_method: '_on_button_pressed',
      flags: 1
    });
  });

  it('calls signal.disconnect', async () => {
    rpc.call.mockResolvedValueOnce({
      disconnected: true,
      source_node_path: '/Main/Button',
      signal_name: 'pressed',
      target_node_path: '/Main',
      target_method: '_on_button_pressed'
    });
    const result = await disconnectSignal(rpc as never, {
      source_node_path: '/Main/Button',
      signal_name: 'pressed',
      target_node_path: '/Main',
      target_method: '_on_button_pressed'
    });
    expect(result.disconnected).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('signal.disconnect', {
      source_node_path: '/Main/Button',
      signal_name: 'pressed',
      target_node_path: '/Main',
      target_method: '_on_button_pressed'
    });
  });
});
