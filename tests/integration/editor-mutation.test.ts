import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, test } from 'vitest';
import { initProject } from '../../packages/cli/src/init/init-project.js';
import {confirmFixtureOperation} from './helpers/confirm-fixture-operation.js';

const fixtureRoot = path.resolve('fixtures/empty-project');
async function retainedRoot(){const parent=path.resolve('.godot-mcp/editor-test-runs');await mkdir(parent,{recursive:true});return mkdtemp(path.join(parent,'mutation-'));}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return await predicate();
}

async function stopProcess(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    new Promise<void>(resolve => setTimeout(resolve, 2_000))
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

describe('Godot editor mutation surface', () => {
  test('executes complete 12-step mutation lifecycle and error suite against live Godot 4.x editor', async () => {
    const godotBin = process.env.GODOT_BIN;
    if (!godotBin) throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');

    const tempRoot = await retainedRoot();
    await cp(fixtureRoot, tempRoot, { recursive: true });
    await initProject({ projectRoot: tempRoot, godotBin, enable: true });

    const serverEntry = path.resolve('packages/server/dist/index.js');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry, '--project', tempRoot, '--bridge-port', '0']
    });
    const client = new Client({ name: 'mutation-integration-test', version: '0.1.0' });
    await client.connect(transport);

    let godot: ChildProcess | null = null;

    try {
      godot = spawn(godotBin, ['--headless', '--path', tempRoot, '--editor', 'res://main.tscn'], {
        stdio: 'inherit',
        windowsHide: true
      });

      // Wait for editor connection
      const connected = await waitFor(async () => {
        const res = await client.callTool({ name: 'session.status', arguments: {} });
        return (res.structuredContent as Record<string, unknown>)['editorConnected'] === true;
      }, 15_000);
      expect(connected).toBe(true);

      // Wait until scene root is ready in editor
      let tree = await client.callTool({ name: 'scene.get_tree', arguments: {} });
      const deadline = Date.now() + 10_000;
      while (!(tree.structuredContent as Record<string, unknown>)['root'] && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
        tree = await client.callTool({ name: 'scene.get_tree', arguments: {} });
      }
      expect((tree.structuredContent as Record<string, unknown>)['root']).toBeTruthy();

      // Step 1: Active scene check
      const activeScene = await client.callTool({ name: 'editor.get_active_scene', arguments: {} });
      expect(activeScene.structuredContent).toMatchObject({
        path: 'res://main.tscn',
        root_name: 'Main',
        root_type: 'Node2D'
      });

      // Step 2: Object Introspection
      const classRes = await client.callTool({
        name: 'object.get_class',
        arguments: { node_path: '/Main' }
      });
      expect(classRes.structuredContent).toEqual({ class: 'Node2D' });

      const propList = await client.callTool({
        name: 'object.get_property_list',
        arguments: { node_path: '/Main' }
      });
      const props = (propList.structuredContent as { properties: Array<{ name: string }> }).properties;
      expect(props.some(p => p.name === 'position')).toBe(true);

      // Step 3: Create Node
      const createNodeRes = await client.callTool({
        name: 'node.create',
        arguments: { parent_path: '/Main', type: 'Node2D', name: 'TestContainer' }
      });
      expect(createNodeRes.structuredContent).toMatchObject({
        name: 'TestContainer',
        type: 'Node2D',
        path: '/Main/TestContainer'
      });

      // Step 4: Set Properties on created node
      const setPropRes = await client.callTool({
        name: 'node.set_property',
        arguments: {
          node_path: '/Main/TestContainer',
          property: 'position',
          value: { x: 150, y: 250 }
        }
      });
      expect(setPropRes.isError).toBeFalsy();

      const getPropRes = await client.callTool({
        name: 'node.get_property',
        arguments: { node_path: '/Main/TestContainer', property: 'position' }
      });
      expect(getPropRes.structuredContent).toMatchObject({
        property: 'position',
        value: { x: 150, y: 250 }
      });

      // Step 5: Add child node
      const addChildRes = await client.callTool({
        name: 'node.create',
        arguments: { parent_path: '/Main/TestContainer', type: 'Marker2D', name: 'SpawnPoint' }
      });
      expect(addChildRes.structuredContent).toMatchObject({
        name: 'SpawnPoint',
        type: 'Marker2D',
        path: '/Main/TestContainer/SpawnPoint'
      });

      // Step 6: Create and attach script
      const scriptCode = `@tool
extends Node2D

var custom_field: int = 42

func test_method() -> int:
\treturn 42
`;
      const createScriptRes = await client.callTool({
        name: 'script.create',
        arguments: {
          path: 'res://test_container.gd',
          template: scriptCode
        }
      });
      expect(createScriptRes.structuredContent).toMatchObject({
        path: 'res://test_container.gd',
        created: true
      });

      const attachRes = await client.callTool({
        name: 'script.attach',
        arguments: {
          node_path: '/Main/TestContainer',
          script_path: 'res://test_container.gd'
        }
      });
      expect(attachRes.structuredContent).toMatchObject({ attached: true });

      const scriptCall = {node_path:'/Main/TestContainer',method:'test_method',trusted_script:true};
      const deniedScript = await client.callTool({name:'object.call',arguments:scriptCall});
      expect(JSON.stringify(deniedScript)).toContain('PERMISSION_DENIED');
      await confirmFixtureOperation(client,'permissions.enable',{permission:'editor.script_methods'});
      const trustedResult = await confirmFixtureOperation(client,'object.call',scriptCall);
      expect(trustedResult.structuredContent).toMatchObject({result:{type:'int',value:42}});
      const indirect = await client.callTool({name:'object.call',arguments:{...scriptCall,method:'call',args:['queue_free']}});
      expect(JSON.stringify(indirect)).toContain('SAFETY_VIOLATION');
      const escaped = await client.callTool({name:'object.get_class',arguments:{node_path:'..'}});
      expect(JSON.stringify(escaped)).toContain('OBJECT_NOT_FOUND');

      // Step 7: Save scene
      const saveRes = await client.callTool({ name: 'scene.save', arguments: {} });
      expect(saveRes.structuredContent).toMatchObject({ saved: true });

      // Step 8: Reload scene
      const reloadRes = await confirmFixtureOperation(client,'scene.reload',{});
      expect(reloadRes.structuredContent).toMatchObject({ reloaded: true });

      // Step 9: Verify values after reload
      const inspectedNode = await client.callTool({
        name: 'node.inspect',
        arguments: { node_path: '/Main/TestContainer' }
      });
      expect(inspectedNode.structuredContent).toMatchObject({
        name: 'TestContainer',
        type: 'Node2D',
        path: '/Main/TestContainer',
        script: 'res://test_container.gd',
        children_count: 1
      });

      // Step 10: Undo operations
      const preUndoSet = await client.callTool({
        name: 'node.set_property',
        arguments: {
          node_path: '/Main/TestContainer',
          property: 'position',
          value: { x: 300, y: 400 }
        }
      });
      expect(preUndoSet.isError).toBeFalsy();

      const undo1 = await client.callTool({ name: 'editor.undo', arguments: {} });
      expect(undo1.structuredContent).toMatchObject({ performed: true });

      const postUndoGet = await client.callTool({
        name: 'node.get_property',
        arguments: { node_path: '/Main/TestContainer', property: 'position' }
      });
      expect(postUndoGet.structuredContent).toMatchObject({
        property: 'position',
        value: { x: 150, y: 250 }
      });

      // Step 11: Redo operations
      const redo1 = await client.callTool({ name: 'editor.redo', arguments: {} });
      expect(redo1.structuredContent).toMatchObject({ performed: true });

      const postRedoGet = await client.callTool({
        name: 'node.get_property',
        arguments: { node_path: '/Main/TestContainer', property: 'position' }
      });
      expect(postRedoGet.structuredContent).toMatchObject({
        property: 'position',
        value: { x: 300, y: 400 }
      });

      // Step 12: Error Conditions Suite
      // 12a: Invalid node path
      const invalidPathRes = await client.callTool({
        name: 'node.inspect',
        arguments: { node_path: '/Main/NonExistentNode' }
      });
      expect(invalidPathRes.isError).toBe(true);
      expect(JSON.stringify(invalidPathRes)).toContain('NODE_NOT_FOUND');

      // 12b: Safety policy blocks dangerous method call
      const blockedCall = await client.callTool({
        name: 'object.call',
        arguments: { node_path: '/Main', method: 'free' }
      });
      expect(blockedCall.isError).toBe(true);
      expect(JSON.stringify(blockedCall)).toContain('SAFETY_VIOLATION');

      // 12c: Script validation reports syntax error
      const validateBadRes = await client.callTool({
        name: 'script.validate',
        arguments: { content: 'extends Node\nfunc _ready(\n' }
      });
      expect(validateBadRes.structuredContent).toMatchObject({
        valid: false
      });
      expect((validateBadRes.structuredContent as { errors: unknown[] }).errors.length).toBeGreaterThan(0);

      // 12d: Script validation succeeds on valid code
      const validateGoodRes = await client.callTool({
        name: 'script.validate',
        arguments: { content: 'extends Node\nfunc _ready() -> void:\n\tpass\n' }
      });
      expect(validateGoodRes.structuredContent).toMatchObject({
        valid: true,
        errors: []
      });

      // 12e: Resource create and inspect
      const resCreate = await client.callTool({
        name: 'resource.create',
        arguments: {
          type: 'Resource',
          path: 'res://test_data.tres'
        }
      });
      expect(resCreate.structuredContent).toMatchObject({
        path: 'res://test_data.tres',
        type: 'Resource'
      });

      const resInspect = await client.callTool({
        name: 'resource.inspect',
        arguments: { path: 'res://test_data.tres' }
      });
      expect(resInspect.structuredContent).toMatchObject({
        path: 'res://test_data.tres',
        type: 'Resource'
      });

      // 12f: Project settings get and set
      const getSettingRes = await client.callTool({
        name: 'project.settings.get',
        arguments: { setting: 'application/config/name' }
      });
      expect(getSettingRes.structuredContent).toMatchObject({
        setting: 'application/config/name',
        value: 'Godot MCP Fixture'
      });

      // 12g: Input Map add and remove
      const addInputRes = await client.callTool({
        name: 'project.input.add_action',
        arguments: { action: 'custom_jump', deadzone: 0.5 }
      });
      expect(addInputRes.structuredContent).toMatchObject({
        action: 'custom_jump',
        added: true
      });

      const listInputRes = await client.callTool({
        name: 'project.input.list',
        arguments: {}
      });
      const actions = (listInputRes.structuredContent as { actions: Array<{ name: string }> }).actions;
      expect(actions.some(a => a.name === 'custom_jump')).toBe(true);

      const removeInputRes = await client.callTool({
        name: 'project.input.remove_action',
        arguments: { action: 'custom_jump' }
      });
      expect(removeInputRes.structuredContent).toMatchObject({
        action: 'custom_jump',
        removed: true
      });
    } finally {
      await stopProcess(godot);
      await client.close();
    }
  }, 45_000);
});
