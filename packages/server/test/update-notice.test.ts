import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { inputRequired, type CallToolResult, type InputRequiredResult } from '@modelcontextprotocol/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { BridgeServer } from '../src/bridge/bridge-server.js';
import { createMcpServer } from '../src/mcp/create-server.js';
import type { ToolRegistrar } from '../src/security/tool-registrar.js';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';
import type { AvailableUpdate, UpdateCheck } from '../src/updates/update-checker.js';
import { withUpdateNotice } from '../src/updates/update-notice.js';

const available: AvailableUpdate = { currentVersion: '0.6.2', latestVersion: '0.6.3' };
async function connected(checker: UpdateCheck) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-update-mcp-'));
  const session = createSession(root);
  const sessions = new SessionStore(root);
  await sessions.create(session);
  const bridge = new BridgeServer({ session, token: 'b'.repeat(64), port: 0 });
  const server = createMcpServer({ session, sessions, bridge, toolProfile: 'minimal', updateChecker: checker });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'update-check-test', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const close = async () => {
    await client.close(); await server.close(); await sessions.flush();
    await fs.rm(root, { recursive: true, force: true });
  };
  return { client, root, close };
}

it('delivers one update through the real MCP protocol, preserving structured content and profile', async () => {
  const { client, root, close } = await connected({ check: async () => available });
  try {
    expect((await client.listTools()).tools).toHaveLength(5);
    const first = await client.callTool({ name: 'session.status', arguments: {} });
    expect(first.structuredContent).toMatchObject({ editorConnected: false });
    expect(first.isError).not.toBe(true);
    expect(first.content.filter(block => block.type === 'text').some(block => block.text.includes('update available'))).toBe(true);
    expect(first._meta?.['godot-mcp/update']).toMatchObject({ ...available, projectRoot: root });
    const second = await client.callTool({ name: 'session.status', arguments: {} });
    expect(second.structuredContent).toEqual(first.structuredContent);
    expect(JSON.stringify(second)).not.toContain('update available');
  } finally { await close(); }
});

it('does not hold tool calls while a background request is pending, and delivers its eventual notice', async () => {
  let resolve!: (value: AvailableUpdate) => void;
  const pending = new Promise<AvailableUpdate>(done => { resolve = done; });
  const { client, close } = await connected({ check: () => pending });
  try {
    const first = await client.callTool({ name: 'session.status', arguments: {} });
    expect(first.structuredContent).toMatchObject({ editorConnected: false });
    expect(JSON.stringify(first)).not.toContain('update available');
    resolve(available);
    await pending;
    const next = await client.callTool({ name: 'session.status', arguments: {} });
    expect(JSON.stringify(next)).toContain('update available');
  } finally { resolve(available); await close(); }
});

it('keeps disconnected errors and operation results when the checker fails', async () => {
  const { client, close } = await connected({ check: () => { throw new Error('registry offline'); } });
  try {
    const result = await client.callTool({ name: 'project.info', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.structuredContent)).toContain('EDITOR_NOT_CONNECTED');
    expect(JSON.stringify(result)).not.toContain('registry offline');
    expect((await client.callTool({ name: 'session.status', arguments: {} })).isError).not.toBe(true);
  } finally { await close(); }
});

it('preserves approval state, images, error flags and metadata, and announces each newly discovered version once', async () => {
  let handler!: () => Promise<CallToolResult | InputRequiredResult>;
  const base = { registerTool: vi.fn((_name, _config, callback) => { handler = callback; }) } as unknown as ToolRegistrar;
  let latest = available;
  const registrar = withUpdateNotice(base, { check: async () => latest }, 'C:/Games/Test');
  let result: CallToolResult | InputRequiredResult = inputRequired({ inputRequests: {}, requestState: 'keep-me' });
  registrar.registerTool('test', {}, () => result);
  await vi.waitFor(() => expect(base.registerTool).toHaveBeenCalledTimes(1));
  expect(await handler()).toBe(result);
  const original: CallToolResult = { content: [{ type: 'image', data: 'image', mimeType: 'image/png' }],
    isError: true, structuredContent: { error: { code: 'EXISTING_ERROR' } }, _meta: { original: true } };
  result = original;
  const first = await handler() as CallToolResult;
  expect(first.content[0]).toEqual(original.content[0]);
  expect(first.structuredContent).toBe(original.structuredContent);
  expect(first.isError).toBe(true);
  expect(first._meta).toMatchObject({ original: true, 'godot-mcp/update': available });
  expect(await handler()).toBe(original);
  latest = { ...available, latestVersion: '0.7.0' };
  await handler();
  await vi.waitFor(async () => expect((await handler() as CallToolResult)._meta?.['godot-mcp/update']).toMatchObject(latest));
  expect(await handler()).toBe(original);
});
