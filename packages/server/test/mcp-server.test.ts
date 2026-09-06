import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BridgeServer } from '../src/bridge/bridge-server.js';
import { createMcpServer } from '../src/mcp/create-server.js';
import { getProjectInfo } from '../src/tools/project-info.js';
import { getSessionStatus } from '../src/tools/session-status.js';
import { createSession, type Session } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';
function disconnectedSession(): Session {
    return {
        id: 's1', projectRoot: 'C:/Games/Test', startedAt: 'x',
        editorConnected: false, runtimeConnected: false,
        godotVersion: null, addonVersion: null, protocolVersion: 1
    };
}
async function persistedDisconnectedSession(): Promise<{ session: Session; sessions: SessionStore }> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-mcp-test-'));
    const session = createSession(root);
    const sessions = new SessionStore(root);
    await sessions.create(session);
    return { session, sessions };
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
    it('lists exactly the registered tools and returns structured disconnected errors', async () => {
        const session = disconnectedSession();
        const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
        const server = createMcpServer({ session, bridge, sessions: new SessionStore(session.projectRoot) });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'test-harness', version: '1.0.0' });
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const tools = await client.listTools();
        const toolNames = tools.tools.map(tool => tool.name).sort();
        expect(toolNames).toEqual([
            'animation.add_track',
            'animation.configure',
            'animation.create',
            'animation.insert_key',
            'animation.inspect',
            'animation.list',
            'animation.remove',
            'animation.remove_key',
            'camera2d.configure',
            'camera2d.inspect',
            'camera3d.configure',
            'camera3d.inspect',
            'checkpoint.create',
            'checkpoint.inspect',
            'checkpoint.list',
            'checkpoint.restore',
            'collision2d.inspect',
            'collision2d.set_shape',
            'collision3d.inspect',
            'collision3d.set_shape',
            'debug.errors',
            'debug.output',
            'debug.performance',
            'debug.warnings',
            'editor.change_scene',
            'editor.close_scene',
            'editor.get_active_scene',
            'editor.get_filesystem',
            'editor.get_open_scenes',
            'editor.get_selected_nodes',
            'editor.redo',
            'editor.scan_filesystem',
            'editor.select_node',
            'editor.undo',
            'godot.capabilities',
            'light3d.configure',
            'light3d.inspect',
            'material3d.clear',
            'material3d.configure_standard',
            'material3d.inspect',
            'material3d.set_standard',
            'mesh3d.inspect',
            'mesh3d.set_primitive',
            'navigation.agent.configure',
            'navigation.agent.inspect',
            'navigation.mesh.bake',
            'navigation.mesh.clear',
            'navigation.mesh.configure',
            'navigation.mesh.inspect',
            'navigation.mesh.set',
            'navigation.mesh.set_outlines',
            'navigation.region.configure',
            'navigation.region.inspect',
            'node.create',
            'node.delete',
            'node.duplicate',
            'node.get_properties',
            'node.get_property',
            'node.inspect',
            'node.list_children',
            'node.move',
            'node.rename',
            'node.reparent',
            'node.set_property',
            'node2d.inspect_transform',
            'node2d.set_transform',
            'node3d.inspect_transform',
            'node3d.set_transform',
            'object.call',
            'object.get',
            'object.get_class',
            'object.get_method_list',
            'object.get_property_list',
            'object.get_signal_list',
            'object.set',
            'parallax2d.configure',
            'parallax2d.inspect',
            'permissions.disable',
            'permissions.enable',
            'permissions.set',
            'permissions.status',
            'project.info',
            'project.input.add_action',
            'project.input.list',
            'project.input.remove_action',
            'project.run',
            'project.run_scene',
            'project.settings.get',
            'project.settings.set',
            'project.stop',
            'resource.create',
            'resource.duplicate',
            'resource.inspect',
            'resource.load',
            'resource.save',
            'resource.set_property',
            'risk.preview',
            'runtime.get_property',
            'runtime.inspect_node',
            'runtime.pause',
            'runtime.restart',
            'runtime.resume',
            'runtime.scene_tree',
            'runtime.status',
            'runtime.stop',
            'scene.create',
            'scene.get_root',
            'scene.get_tree',
            'scene.instantiate',
            'scene.open',
            'scene.reload',
            'scene.save',
            'scene.save_as',
            'script.attach',
            'script.create',
            'script.detach',
            'script.inspect',
            'script.validate',
            'session.manifest',
            'session.status',
            'shader3d.inspect',
            'shader3d.set_code',
            'shader3d.set_parameter',
            'signal.connect',
            'signal.connections',
            'signal.disconnect',
            'signal.list',
            'sprite2d.configure',
            'sprite2d.inspect',
            'sprite2d.set_texture',
            'tilemap.clear',
            'tilemap.erase_cells',
            'tilemap.get_cells',
            'tilemap.inspect',
            'tilemap.local_to_map',
            'tilemap.map_to_local',
            'tilemap.set_cell',
            'tilemap.set_cells',
            'tileset.add_atlas_source',
            'tileset.create_atlas_tiles',
            'tileset.ensure_for_layer',
            'tileset.inspect',
            'tileset.inspect_atlas_source',
            'tileset.remove_source',
            'transaction.begin',
            'transaction.commit',
            'transaction.delete_file',
            'transaction.preview',
            'transaction.recover',
            'transaction.rollback',
            'transaction.status',
            'transaction.write_file',
            'ui.inspect_layout',
            'ui.set_anchors',
            'ui.set_focus_neighbor',
            'ui.set_layout_preset',
            'ui.set_offsets',
            'ui.set_size_flags',
            'visual.capture_game',
            'visual.capture_viewport_2d',
            'visual.capture_viewport_3d',
            'workflow.diff_since',
            'workflow.run_check',
            'workflow.snapshot',
        ]);
        const status = await client.callTool({ name: 'session.status', arguments: {} });
        expect(status.structuredContent).toMatchObject({ sessionId: 's1', editorConnected: false });
        const project = await client.callTool({ name: 'project.info', arguments: {} });
        expect(project.isError).toBe(true);
        expect(JSON.stringify(project)).toContain('EDITOR_NOT_CONNECTED');
        const capabilities = await client.callTool({ name: 'godot.capabilities', arguments: {} });
        expect(capabilities.isError).toBe(true);
        expect(JSON.stringify(capabilities)).toContain('EDITOR_NOT_CONNECTED');
        await client.close();
        await server.close();
    }, 15000);
    it('elicits host approval for risky tools without exposing a bearer confirmation token', async () => {
        const { session, sessions } = await persistedDisconnectedSession();
        const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
        const server = createMcpServer({ session, bridge, sessions });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'approval-test', version: '1.0.0' }, { capabilities: { elicitation: { form: {} } } });
        client.setRequestHandler('elicitation/create', async (request) => {
            expect(request.params.message).toContain('permissions.enable');
            expect(request.params.message).toContain('permission:filesystem.external');
            expect(request.params.message).toContain('Arguments: permission=\"filesystem.external\"');
            return { action: 'accept', content: { confirm: true } };
        });
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const result = await client.callTool({
            name: 'permissions.enable',
            arguments: { permission: 'filesystem.external' }
        });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ permission: 'filesystem.external', enabled: true, scope: 'session' });
        expect(JSON.stringify(result)).not.toContain('confirmationToken');
        await client.close();
        await server.close();
    });
    it('does not execute a risky tool when host approval is declined', async () => {
        const { session, sessions } = await persistedDisconnectedSession();
        const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
        const server = createMcpServer({ session, bridge, sessions });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'approval-decline-test', version: '1.0.0' }, { capabilities: { elicitation: { form: {} } } });
        client.setRequestHandler('elicitation/create', async () => ({ action: 'decline' }));
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const result = await client.callTool({
            name: 'permissions.enable',
            arguments: { permission: 'filesystem.external' }
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({ error: { code: 'APPROVAL_DECLINED' } });
        expect((await client.callTool({ name: 'permissions.status', arguments: {} })).structuredContent)
            .toMatchObject({ permissions: { 'filesystem.external': false } });
        await client.close();
        await server.close();
    });
});
