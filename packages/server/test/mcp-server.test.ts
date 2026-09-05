import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { describe, expect, it, vi } from 'vitest';
import { BridgeServer } from '../src/bridge/bridge-server.js';
import { createMcpServer } from '../src/mcp/create-server.js';
import { getProjectInfo } from '../src/tools/project-info.js';
import { getSessionStatus } from '../src/tools/session-status.js';
import type { Session } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';

function disconnectedSession(): Session {
  return {
    id: 's1', projectRoot: 'C:/Games/Test', startedAt: 'x',
    editorConnected: false, runtimeConnected: false,
    godotVersion: null, addonVersion: null, protocolVersion: 1
  };
}

it('returns session status without requiring an editor connection', async () => {
  expect(getSessionStatus(disconnectedSession())).toMatchObject({ sessionId: 's1', editorConnected: false });
});

it('forwards project.info to the addon', async () => {
  const rpc = { call: vi.fn().mockResolvedValue({ name: 'Fixture' }) };
  await expect(getProjectInfo(rpc as never)).resolves.toEqual({ name: 'Fixture' });
  expect(rpc.call).toHaveBeenCalledWith('project.info', {});
});

describe('MCP server', () => {
  it('lists exactly the foundation tools and returns structured disconnected errors', async () => {
    const session = disconnectedSession();
    const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
    const server = createMcpServer({ session, bridge, sessions:new SessionStore(session.projectRoot) });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-harness', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map(tool => tool.name);
    expect(toolNames).toContain('project.info');
    expect(toolNames).toContain('scene.get_tree');
    expect(toolNames).toContain('session.status');
    expect(toolNames).toContain('object.get_class');
    expect(toolNames).toContain('scene.create');
    expect(toolNames).toContain('scene.open');
    expect(toolNames).toContain('scene.save');
    expect(toolNames).toContain('scene.save_as');
    expect(toolNames).toContain('scene.reload');
    expect(toolNames).toContain('scene.instantiate');
    expect(toolNames).toContain('scene.get_root');
    expect(toolNames).toContain('node.create');
    expect(toolNames).toContain('node.delete');
    expect(toolNames).toContain('node.duplicate');
    expect(toolNames).toContain('node.rename');
    expect(toolNames).toContain('node.reparent');
    expect(toolNames).toContain('node.move');
    expect(toolNames).toContain('node.inspect');
    expect(toolNames).toContain('node.list_children');
    expect(toolNames).toContain('node.get_property');
    expect(toolNames).toContain('node.set_property');
    expect(toolNames).toContain('node.get_properties');
    expect(toolNames).toContain('resource.load');
    expect(toolNames).toContain('resource.inspect');
    expect(toolNames).toContain('resource.create');
    expect(toolNames).toContain('resource.set_property');
    expect(toolNames).toContain('resource.save');
    expect(toolNames).toContain('resource.duplicate');
    expect(toolNames).toContain('script.create');
    expect(toolNames).toContain('script.attach');
    expect(toolNames).toContain('script.detach');
    expect(toolNames).toContain('script.inspect');
    expect(toolNames).toContain('script.validate');
    expect(toolNames).toContain('signal.list');
    expect(toolNames).toContain('signal.connections');
    expect(toolNames).toContain('signal.connect');
    expect(toolNames).toContain('signal.disconnect');
    expect(toolNames).toContain('project.settings.get');
    expect(toolNames).toContain('project.settings.set');
    expect(toolNames).toContain('project.input.list');
    expect(toolNames).toContain('project.input.add_action');
    expect(toolNames).toContain('project.input.remove_action');
    expect(toolNames).toContain('editor.get_active_scene');
    expect(toolNames).toContain('editor.get_open_scenes');
    expect(toolNames).toContain('editor.get_selected_nodes');
    expect(toolNames).toContain('editor.select_node');
    expect(toolNames).toContain('editor.change_scene');
    expect(toolNames).toContain('editor.undo');
    expect(toolNames).toContain('editor.redo');
    expect(toolNames).toContain('editor.get_filesystem');
    expect(toolNames).toContain('editor.scan_filesystem');
    const status = await client.callTool({ name: 'session.status', arguments: {} });
    expect(status.structuredContent).toMatchObject({ sessionId: 's1', editorConnected: false });
    const project = await client.callTool({ name: 'project.info', arguments: {} });
    expect(project.isError).toBe(true);
    expect(JSON.stringify(project)).toContain('EDITOR_NOT_CONNECTED');

    await client.close();
    await server.close();
  }, 15_000);
});
