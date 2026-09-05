import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { describe, expect, it, vi } from 'vitest';
import { BridgeServer } from '../src/bridge/bridge-server.js';
import { createMcpServer } from '../src/mcp/create-server.js';
import { getProjectInfo } from '../src/tools/project-info.js';
import { getSessionStatus } from '../src/tools/session-status.js';
import type { Session } from '../src/session/session.js';

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
    const server = createMcpServer({ session, bridge });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-harness', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name).sort()).toEqual(['project.info', 'scene.get_tree', 'session.status']);
    const status = await client.callTool({ name: 'session.status', arguments: {} });
    expect(status.structuredContent).toMatchObject({ sessionId: 's1', editorConnected: false });
    const project = await client.callTool({ name: 'project.info', arguments: {} });
    expect(project.isError).toBe(true);
    expect(JSON.stringify(project)).toContain('EDITOR_NOT_CONNECTED');

    await client.close();
    await server.close();
  });
});
