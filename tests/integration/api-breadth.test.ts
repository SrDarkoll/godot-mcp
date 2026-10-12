import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { runtimeHarness, waitFor } from './helpers/runtime-harness.js';
import { watch, readFileSync } from 'node:fs';
import {pathToFileURL} from 'node:url';

it('exercises editor, node, scene, resource, signal, permissions and recovery APIs missing from the baseline', async () => {
  const h = await runtimeHarness({ noRuntimeError: true });
  const completed: string[] = [];
  h.client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: { confirm: true } }));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await h.client.callTool({ name, arguments: args });
    expect(result.isError, `${name}: ${JSON.stringify(result.structuredContent)}`).not.toBe(true);
    completed.push(name);
    return result.structuredContent as any;
  };
  try {
    await fs.writeFile(path.join(h.root, 'audit_signals.gd'), 'extends Node2D\nsignal pulse(value: int)\nfunc record(value: int) -> void:\n    set_meta("last_pulse", value)\n');
    await fs.writeFile(path.join(h.root, 'audit_resource.tres'), '[gd_resource type="Resource" format=3]\n[resource]\nresource_name="original"\n');
    await call('editor.scan_filesystem');
    await call('editor.get_filesystem');
    await call('editor.get_open_scenes');
    await call('editor.get_selected_nodes');
    await call('scene.create', { root_type: 'Node2D', root_name: 'PrefabRoot', path: 'res://audit_prefab.tscn' });
    await call('scene.get_root');
    await call('scene.save_as', { path: 'res://audit_prefab_copy.tscn' });
    await call('scene.open', { path: 'res://main.tscn' });
    await call('editor.change_scene', { path: 'res://audit_prefab_copy.tscn' });
    await call('editor.change_scene', { path: 'res://main.tscn' });
    await call('scene.instantiate', { path: 'res://audit_prefab_copy.tscn', parent_path: '/Main', name: 'PrefabInstance' });
    await call('node.create', { parent_path: '/Main', type: 'Node2D', name: 'AuditA' });
    await call('node.duplicate', { node_path: '/Main/AuditA', new_name: 'AuditB' });
    await call('node.rename', { node_path: '/Main/AuditB', new_name: 'Renamed' });
    await call('node.create', { parent_path: '/Main', type: 'Node2D', name: 'Group' });
    await call('node.reparent', { node_path: '/Main/Renamed', new_parent_path: '/Main/Group', keep_global_transform: true });
    await call('node.move', { node_path: '/Main/Group/Renamed', index: 0 });
    await call('node.get_properties', { node_path: '/Main/AuditA', properties: ['visible', 'position'] });
    await call('editor.select_node', { node_path: '/Main/AuditA', additive: false });
    await call('object.get_method_list', { node_path: '/Main/AuditA' });
    await call('object.get_signal_list', { node_path: '/Main/AuditA' });
    await call('object.get', { node_path: '/Main/AuditA', property: 'visible' });
    await call('object.set', { node_path: '/Main/AuditA', property: 'visible', value: false });
    expect((await call('object.get', { node_path: '/Main/AuditA', property: 'visible' })).value).toEqual({ type: 'bool', value: false });
    await call('object.call', { node_path: '/Main/AuditA', method: 'get_name', args: [] });
    await call('script.attach', { node_path: '/Main/AuditA', script_path: 'res://audit_signals.gd' });
    await call('script.inspect', { path: 'res://audit_signals.gd' });
    await call('signal.list', { node_path: '/Main/AuditA' });
    await call('signal.connect', { source_node_path: '/Main/AuditA', signal_name: 'pulse', target_node_path: '/Main/AuditA', target_method: 'record' });
    await call('signal.connections', { node_path: '/Main/AuditA', signal_name: 'pulse' });
    await call('signal.disconnect', { source_node_path: '/Main/AuditA', signal_name: 'pulse', target_node_path: '/Main/AuditA', target_method: 'record' });
    await call('script.detach', { node_path: '/Main/AuditA' });
    await call('node.delete', { node_path: '/Main/Group/Renamed' });
    await call('resource.load', { path: 'res://audit_resource.tres' });
    await call('resource.set_property', { path: 'res://audit_resource.tres', property: 'resource_name', value: 'changed' });
    await call('resource.save', { path: 'res://audit_resource.tres', flags: 0 });
    await call('resource.duplicate', { source_path: 'res://audit_resource.tres', target_path: 'res://audit_resource_copy.tres', subresources: true });
    expect(await fs.readFile(path.join(h.root, 'audit_resource_copy.tres'), 'utf8')).toContain('changed');
    await call('project.settings.set', { setting: 'application/config/name', value: 'Coverage Audit', save: false });
    await call('node.create', { parent_path: '/Main', type: 'TileMapLayer', name: 'AuditGround' });
    await call('tileset.ensure_for_layer', { node_path: '/Main/AuditGround', tile_size: { x: 16, y: 16 } });
    await call('tileset.add_atlas_source', { node_path: '/Main/AuditGround', texture_path: 'res://noise.png', texture_region_size: { x: 16, y: 16 }, source_id: 0 });
    await call('tileset.create_atlas_tiles', { node_path: '/Main/AuditGround', source_id: 0, tiles: [{ atlas_coords: { x: 0, y: 0 } }] });
    await call('tilemap.set_cell', { node_path: '/Main/AuditGround', coords: { x: 0, y: 0 }, source_id: 0, atlas_coords: { x: 0, y: 0 } });
    await call('scene.save');
    await call('risk.preview', { tool: 'node.delete', arguments: { node_path: '/Main/AuditA' } });
    await call('workflow.snapshot', { label: 'coverage', capture: 'none', checkpoint: false });
    await call('debug.breakpoint.list');
    await call('project.run');
    await waitFor(async () => (await call('runtime.status')).state === 'running', 15000);
    await call('runtime.inspect_node', { node_path: '/root/Main', properties: ['position'] });
    await call('project.stop');
    await call('permissions.enable', { permission: 'filesystem.external' });
    await call('permissions.disable', { permission: 'filesystem.external' });
    for(let index=0;index<6;index++){
      const scenes=await call('editor.get_open_scenes');
      if(!(scenes.scenes??[]).length)break;
      await call('editor.close_scene');
    }
    await fs.writeFile(path.join(h.root, 'audit_delete.txt'), 'original bytes\n');
    const paths = ['res://audit_delete.txt'];
    const checkpoint = await call('checkpoint.create', { label: 'delete rollback', paths });
    await call('checkpoint.inspect', { checkpoint_id: checkpoint.id });
    const transaction = await call('transaction.begin', { label: 'delete rollback', paths });
    await call('transaction.delete_file', { transaction_id: transaction.id, path: paths[0] });
    await call('transaction.preview', { transaction_id: transaction.id });
    await call('transaction.status', { transaction_id: transaction.id });
    await call('transaction.rollback', { transaction_id: transaction.id });
    expect(await fs.readFile(path.join(h.root, 'audit_delete.txt'), 'utf8')).toBe('original bytes\n');
    await fs.writeFile(path.join(h.root, 'coverage-completion.json'), JSON.stringify({ completed: [...new Set(completed)].sort() }, null, 2));
  } finally { await h.close(); }
}, 120000);

it('recovers a real interrupted publication after killing only its owned MCP process', async () => {
  const h = await runtimeHarness({ noRuntimeError: true });
  await h.closeClient();
  await waitFor(async () => {
    try { await fs.stat(path.join(h.root, '.godot-mcp/runtime/bridge.json')); return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
  }, 5000);
  const entry = path.resolve('packages/server/dist/index.js');
  const wrapper=path.join(h.root,'fault-injected-mcp.mjs');
  const sourceRoot=pathToFileURL(path.resolve('packages/server/dist')).href;
  await fs.writeFile(wrapper,`import {runExclusiveServer as runServer} from '${sourceRoot}/index.js';\nimport {ProjectFiles} from '${sourceRoot}/recovery/project-files.js';\nimport fs from 'node:fs/promises';\nconst original=ProjectFiles.prototype.write;\nProjectFiles.prototype.write=async function(value,bytes,...args){await original.call(this,value,bytes,...args);if(String(value).endsWith('crash_recovery.gd')&&bytes?.toString().includes('value = 2')){await fs.writeFile(${JSON.stringify(path.join(h.root,'.godot-mcp/runtime/after-publish-marker'))},'ready');await new Promise(resolve=>setTimeout(resolve,1500));}};\nawait runServer(process.argv.slice(2));\n`);
  const connect = async (fault=false) => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [fault?wrapper:entry, '--project', h.root, '--bridge-port', '0'], stderr: 'pipe' });
    const client = new Client({ name: 'crash-recovery-test', version: '1' }, { capabilities: { elicitation: { form: {} } } });
    client.setRequestHandler('elicitation/create', async () => ({ action: 'accept', content: { confirm: true } }));
    await client.connect(transport);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, `${name}: ${JSON.stringify(result.structuredContent)}`).not.toBe(true);
      return result.structuredContent as any;
    };
    await waitFor(async () => (await call('session.status')).editorConnected === true, 15000);
    return { client, transport, call };
  };
  const first = await connect(true);
  let fresh: Awaited<ReturnType<typeof connect>> | undefined;
  let watcher: ReturnType<typeof watch> | undefined;
  try {
    const file = path.join(h.root, 'crash_recovery.gd');
    await fs.writeFile(file, 'extends Node\nvar value = 1\n');
    const status = await first.call('session.status');
    await first.call('editor.close_scene');
    const transaction = await first.call('transaction.begin', { label: 'crash', paths: ['res://crash_recovery.gd'] });
    await first.call('transaction.write_file', { transaction_id: transaction.id, path: 'res://crash_recovery.gd', content: 'extends Node\nvar value = 2\n' });
    const pid = first.transport.pid;
    expect(pid).toBeGreaterThan(0);
    let killed = false;
    watcher = watch(path.join(h.root, '.godot-mcp/runtime'), (_event, filename) => {
      if (killed || String(filename) !== 'after-publish-marker') return;
      try {
        const journal = JSON.parse(readFileSync(path.join(h.root, '.godot-mcp/runtime/recovery.json'), 'utf8'));
        if (journal.id !== transaction.id || journal.sessionId !== status.sessionId) return;
        process.kill(pid!, 'SIGKILL'); killed = true; watcher?.close();
      } catch {}
    });
    await first.call('transaction.commit', { transaction_id: transaction.id }).catch(error => { if(!killed)throw error; });
    expect(killed).toBe(true);
    expect(await fs.readFile(file,'utf8')).toBe('extends Node\nvar value = 2\n');
    await first.client.close();
    fresh = await connect();
    const recovered = await fresh.call('transaction.recover', { session_id: status.sessionId, transaction_id: transaction.id });
    expect(recovered.state).toBe('rolled_back');
    expect(await fs.readFile(file, 'utf8')).toBe('extends Node\nvar value = 1\n');
    await fs.writeFile(path.join(h.root, 'crash-recovery-evidence.json'), JSON.stringify({ killedOwnedPid: pid, session: status.sessionId, transaction: transaction.id, state: recovered.state }, null, 2));
  } finally {
    watcher?.close(); await first.client.close(); await fresh?.client.close(); await h.closeEditor();
  }
}, 60000);
