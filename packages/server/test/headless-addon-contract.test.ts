import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('headless addon child isolation', () => {
  it('returns from _enter_tree before constructing the debugger or bridge for manager-owned headless children', async () => {
    const source = await fs.readFile(new URL('../../godot-addon/addons/godot_mcp/plugin.gd', import.meta.url), 'utf8');
    const enter = source.indexOf('func _enter_tree()');
    const marker = source.indexOf('OS.get_environment("GODOT_MCP_HEADLESS_CHILD") == "1"', enter);
    const markerReturn = source.indexOf('return', marker);
    const debuggerSetup = source.indexOf('editor_debugger.gd', enter);
    const bridgeSetup = source.indexOf('bridge_client.gd', enter);

    expect(enter).toBeGreaterThanOrEqual(0);
    expect(marker).toBeGreaterThan(enter);
    expect(markerReturn).toBeGreaterThan(marker);
    expect(debuggerSetup).toBeGreaterThan(markerReturn);
    expect(bridgeSetup).toBeGreaterThan(markerReturn);
  });
});
