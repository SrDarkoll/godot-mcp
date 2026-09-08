import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  blockedReflectiveMethods,
  isBlockedReflectiveMethod
} from '../src/security/reflection-safety.js';

const addonPolicyPath = fileURLToPath(
  new URL('../../godot-addon/addons/godot_mcp/bridge/safety_policy.gd', import.meta.url)
);

function parseGodotBlocklist(source: string): string[] {
  const match = source.match(/const BLOCKED_METHODS:[\s\S]*?= \[([\s\S]*?)\n\]/);
  if (!match) throw new Error('Godot safety policy BLOCKED_METHODS list not found');
  return [...match[1].matchAll(/"([^"]+)"/g)].map(entry => entry[1]).sort();
}

describe('reflective method safety', () => {
  it('keeps the Node and Godot bridge blocklists identical', async () => {
    const godotPolicy = await readFile(addonPolicyPath, 'utf8');
    expect(parseGodotBlocklist(godotPolicy)).toEqual(blockedReflectiveMethods());
  });

  it('blocks private and structural escape methods without blocking ordinary user methods', () => {
    for (const method of [
      '_process', 'free', 'call', 'callv', 'set', 'rpc', 'add_child', 'reparent',
      'call_thread_safe', 'set_thread_safe', 'emit_signal', 'notification', 'propagate_notification'
    ]) {
      expect(isBlockedReflectiveMethod({ method })).toBe(true);
    }
    expect(isBlockedReflectiveMethod({ method: 'recalculate_damage' })).toBe(false);
    expect(isBlockedReflectiveMethod({ method: 'jump' })).toBe(false);
  });

  it('rejects malformed or empty method names', () => {
    for (const method of ['', '   ', '123start', 'has space', 'call;rm', '../escape', '$symbol']) {
      expect(isBlockedReflectiveMethod({ method })).toBe(true);
    }
  });
});
