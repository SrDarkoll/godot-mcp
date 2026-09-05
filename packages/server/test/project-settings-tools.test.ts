import { describe, expect, it, vi } from 'vitest';
import {
  getProjectSetting,
  setProjectSetting,
  listInputActions,
  addInputAction,
  removeInputAction
} from '../src/tools/project-settings-tools.js';

describe('project settings and input tools', () => {
  const rpc = {
    call: vi.fn()
  };

  it('calls project.settings.get', async () => {
    rpc.call.mockResolvedValueOnce({
      setting: 'application/config/name',
      value: 'My Game'
    });
    const result = await getProjectSetting(rpc as never, { setting: 'application/config/name' });
    expect(result.value).toBe('My Game');
    expect(rpc.call).toHaveBeenCalledWith('project.settings.get', { setting: 'application/config/name' });
  });

  it('calls project.settings.set', async () => {
    rpc.call.mockResolvedValueOnce({
      setting: 'application/config/name',
      previous_value: 'Old Name',
      new_value: 'New Name',
      saved: true
    });
    const result = await setProjectSetting(rpc as never, {
      setting: 'application/config/name',
      value: 'New Name',
      save: true
    });
    expect(result.saved).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('project.settings.set', {
      setting: 'application/config/name',
      value: 'New Name',
      save: true
    });
  });

  it('calls project.input.list', async () => {
    rpc.call.mockResolvedValueOnce({
      actions: [{ name: 'jump', deadzone: 0.5, events: [{ type: 'InputEventKey', keycode: 32 }] }]
    });
    const result = await listInputActions(rpc as never, {});
    expect(result.actions).toHaveLength(1);
    expect(rpc.call).toHaveBeenCalledWith('project.input.list', {});
  });

  it('calls project.input.add_action', async () => {
    rpc.call.mockResolvedValueOnce({
      action: 'jump',
      added: true
    });
    const result = await addInputAction(rpc as never, { action: 'jump', deadzone: 0.5 });
    expect(result.added).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('project.input.add_action', { action: 'jump', deadzone: 0.5 });
  });

  it('calls project.input.remove_action', async () => {
    rpc.call.mockResolvedValueOnce({
      action: 'jump',
      removed: true
    });
    const result = await removeInputAction(rpc as never, { action: 'jump' });
    expect(result.removed).toBe(true);
    expect(rpc.call).toHaveBeenCalledWith('project.input.remove_action', { action: 'jump' });
  });
});
