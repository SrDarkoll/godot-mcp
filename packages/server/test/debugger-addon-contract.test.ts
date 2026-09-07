import fs from 'node:fs/promises';
import {expect,it} from 'vitest';

it('exposes individual breakpoint mutation and local debugger discovery without raw DAP forwarding',async()=>{
  const source=await fs.readFile(new URL('../../godot-addon/addons/godot_mcp/debugger/editor_debugger.gd',import.meta.url),'utf8');
  expect(source).toContain('get_breakpoints()');
  expect(source).toContain('set_breakpoint(');
  expect(source).toContain('network/debug_adapter/remote_port');
  expect(source).toContain('network/debug/remote_port');
  expect(source).toContain('debugger.breakpoints');
  expect(source).not.toContain('debug.send_dap_request');
  expect(source).not.toContain('setVariable');
});

it('routes only the approved private debugger bridge methods',async()=>{
  const source=await fs.readFile(new URL('../../godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd',import.meta.url),'utf8');
  for(const method of ['debugger.info','debugger.breakpoint.set','debugger.breakpoint.remove']) {
    expect(source).toContain(`\"${method}\"`);
  }
  expect(source.match(/\"debugger\.[^\"]+\"/g)?.sort()).toEqual([
    '"debugger.breakpoint.remove"',
    '"debugger.breakpoint.set"',
    '"debugger.info"'
  ]);
  expect(source).not.toContain('debug.send_dap_request');
});
