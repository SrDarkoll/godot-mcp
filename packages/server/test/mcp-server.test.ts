import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BridgeServer } from '../src/bridge/bridge-server.js';
import { createMcpServer } from '../src/mcp/create-server.js';
import { toolNamesForProfile } from '../src/tooling/tool-catalog.js';
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
        expect(toolNames).toEqual(toolNamesForProfile('full'));
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
    it('filters the registered MCP surface deterministically by profile', async () => {
        const list = async (toolProfile: 'minimal' | '3d' | 'runtime') => {
            const session = disconnectedSession();
            const bridge = new BridgeServer({ session, token: 'b'.repeat(64), port: 0 });
            const server = createMcpServer({ session, bridge, sessions: new SessionStore(session.projectRoot), toolProfile });
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            const client = new Client({ name: `profile-${toolProfile}`, version: '1.0.0' });
            await server.connect(serverTransport);
            await client.connect(clientTransport);
            try { return (await client.listTools()).tools.map(tool => tool.name).sort(); }
            finally { await client.close(); await server.close(); }
        };

        expect(await list('minimal')).toEqual(toolNamesForProfile('minimal'));
        const tools3d = await list('3d');
        expect(tools3d).toEqual(toolNamesForProfile('3d'));
        expect(tools3d).toContain('mesh3d.set_primitive');
        expect(tools3d).toContain('navigation.mesh.bake');
        expect(tools3d).not.toContain('tilemap.set_cell');
        expect(tools3d).not.toContain('object.call');

        const runtimeTools = await list('runtime');
        expect(runtimeTools).toEqual(toolNamesForProfile('runtime'));
        expect(runtimeTools.filter(name => name.startsWith('headless.'))).toEqual([
            'headless.get_output',
            'headless.import',
            'headless.run',
            'headless.run_scene',
            'headless.run_tests',
            'headless.status',
            'headless.stop',
            'headless.validate_project'
        ]);
    });

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
