import fs from 'node:fs/promises';
import {expect,it} from 'vitest';

it('exposes individual breakpoint mutation and local debugger discovery without raw DAP forwarding',async()=>{
  const source=await fs.readFile(new URL('../../godot-addon/addons/godot_mcp/debugger/editor_debugger.gd',import.meta.url),'utf8');
  expect(source).toContain('get_breakpoints()');
  expect(source).toContain('set_breakpoint(');
  expect(source).toContain('network/debug_adapter/remote_port');
  expect(source).toContain('network/debug/remote_port');
  expect(source).toContain('OS.get_cmdline_user_args()');
  expect(source).toContain('--godot-mcp-dap-port');
  expect(source).toContain('--godot-mcp-debug-server');
  expect(source).not.toContain('_cmdline_value("--dap-port")');
  expect(source).toContain('debugger.breakpoints');
  expect(source).not.toContain('debug.send_dap_request');
  expect(source).not.toContain('setVariable');
  expect(source).toContain('send_message("out",[])');
  expect(source).toContain('var _dap_sync_depth := 0');
  expect(source).toContain('func begin_dap_sync() -> Dictionary:');
  expect(source).toContain('func end_dap_sync() -> Dictionary:');
  expect(source).toContain('if _dap_sync_depth > 0:');
  expect(source).toContain('_apply_owned_breakpoints(get_session(id))');
});

it('drops addon ownership when the user changes or clears an MCP-owned breakpoint',async()=>{
  const source=await fs.readFile(new URL('../../godot-addon/addons/godot_mcp/debugger/editor_debugger.gd',import.meta.url),'utf8');
  expect(source).toContain('if _mcp_origin_depth == 0:');
  expect(source).toContain('_mcp_breakpoints.erase(_breakpoint_key(path,line))');
  expect(source).toContain('_mcp_breakpoints.clear()\n    _publish_breakpoints()');
});

it('does not use reserved GDScript breakpoint keyword as an identifier',async()=>{
  const source=await fs.readFile(new URL('../../godot-addon/addons/godot_mcp/debugger/editor_debugger.gd',import.meta.url),'utf8');
  expect(source).not.toMatch(/\b(?:var|for)\s+breakpoint\b/);
});

it('routes only the approved private debugger bridge methods',async()=>{
  const source=await fs.readFile(new URL('../../godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd',import.meta.url),'utf8');
  for(const method of ['debugger.info','debugger.breakpoint.set','debugger.breakpoint.remove','debugger.dap_sync.begin','debugger.dap_sync.end','debugger.step_out']) {
    expect(source).toContain(`\"${method}\"`);
  }
  expect(source.match(/\"debugger\.[^\"]+\"/g)?.sort()).toEqual([
    '"debugger.breakpoint.remove"',
    '"debugger.breakpoint.set"',
    '"debugger.dap_sync.begin"',
    '"debugger.dap_sync.end"',
    '"debugger.info"',
    '"debugger.step_out"'
  ]);
  expect(source).not.toContain('debug.send_dap_request');
});
