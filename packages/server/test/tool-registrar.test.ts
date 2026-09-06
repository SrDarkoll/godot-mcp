import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CallToolResult, McpServer, ServerContext } from '@modelcontextprotocol/server';
import { ToolDiscoveryParamsSchema } from '@godot-mcp/protocol';
import { describe, expect, it, vi } from 'vitest';
import { RecoveryService } from '../src/recovery/recovery-service.js';
import { guardedRegistrar, type RiskApprovalState } from '../src/security/tool-registrar.js';
import { ToolPolicy } from '../src/security/tool-policy.js';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';
import { bindCanonicalTool, defineCanonicalToolBinding } from '../src/tooling/canonical-tool-binding.js';
import { ToolRegistry } from '../src/tooling/tool-registry.js';

type Handler = (args: Record<string, unknown>, context: ServerContext) => unknown | Promise<unknown>;

async function setup() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-registrar-'));
    const session = createSession(root);
    const sessions = new SessionStore(root);
    await sessions.create(session);
    const recovery = new RecoveryService(session, sessions, {
        connected: false,
        rpc: { call: async () => ({}) }
    });
    const policy = new ToolPolicy(session, sessions, recovery);
    const handlers = new Map<string, Handler>();
    const server = {
        registerTool(name: string, _config: unknown, handler: Handler) {
            handlers.set(name, handler);
            return {};
        }
    } as unknown as McpServer;
    const registrar = guardedRegistrar(server, policy, {
        mint: async payload => JSON.stringify(payload)
    });
    const register = registrar.registerTool as unknown as (
        name: string,
        config: unknown,
        handler: Handler
    ) => unknown;
    return { policy, handlers, register };
}

function context(state?: RiskApprovalState, accepted = false): ServerContext {
    return {
        mcpReq: {
            method: 'tools/call',
            requestState: () => state,
            inputResponses: accepted ? {
                riskApproval: { action: 'accept', content: { confirm: true } }
            } : undefined
        }
    } as unknown as ServerContext;
}

function result(): CallToolResult {
    return { content: [{ type: 'text', text: 'ok' }], structuredContent: { ok: true } };
}

it('does not let approval state for one risky tool authorize another tool', async () => {
    const { handlers, register } = await setup();
    let enableRuns = 0;
    let setRuns = 0;
    register('permissions.enable', {}, async () => { enableRuns++; return result(); });
    register('permissions.set', {}, async () => { setRuns++; return result(); });

    const enable = handlers.get('permissions.enable')!;
    const set = handlers.get('permissions.set')!;
    const first = await enable({ permission: 'filesystem.external' }, context()) as any;
    expect(first.requestState).toEqual(expect.any(String));
    const firstState = JSON.parse(first.requestState) as RiskApprovalState;

    const mismatched = await set(
        { permission: 'filesystem.external', enabled: true },
        context(firstState, true)
    ) as any;

    expect(mismatched.requestState).toEqual(expect.any(String));
    expect(mismatched.inputRequests?.riskApproval).toBeDefined();
    expect(enableRuns).toBe(0);
    expect(setRuns).toBe(0);
});

it('rejects replay of an already-consumed risky approval state', async () => {
    const { handlers, register } = await setup();
    let runs = 0;
    register('permissions.enable', {}, async () => { runs++; return result(); });
    const enable = handlers.get('permissions.enable')!;

    const first = await enable({ permission: 'filesystem.external' }, context()) as any;
    expect(first.requestState).toEqual(expect.any(String));
    expect(first.inputRequests?.riskApproval).toBeDefined();
    const state = JSON.parse(first.requestState) as RiskApprovalState;

    const approved = await enable(
        { permission: 'filesystem.external' },
        context(state, true)
    ) as any;
    expect(approved.isError).not.toBe(true);
    expect(runs).toBe(1);

    const replay = await enable(
        { permission: 'filesystem.external' },
        context(state, true)
    ) as any;
    expect(replay.isError).toBe(true);
    expect(replay.structuredContent).toMatchObject({ error: { code: 'APPROVAL_REPLAYED' } });
    expect(runs).toBe(1);
});


describe('profiled tool registrar', () => {
    it('observes declarations but forwards only tools active in the selected profile', () => {
        const registerTool = vi.fn(() => ({}) as never);
        const registry = new ToolRegistry('minimal');
        const registrar = registry.registeringRegistrar({ registerTool } as never);
        const handler = vi.fn();
        registrar.registerTool('session.status', { description: 'Return the active Godot MCP session and editor/runtime connection state.', inputSchema: {} } as never, handler as never);
        registrar.registerTool('node.create', { description: 'Create a new node as a child of a parent node in the edited scene with Undo/Redo support.', inputSchema: {} } as never, handler as never);
        expect(registerTool.mock.calls.map(call => call[0])).toEqual(['session.status']);
        expect(registry.observedNames()).toEqual(['node.create', 'session.status']);
    });


    it('fails fast when the static catalog has declarations that were never observed', () => {
        const registry = new ToolRegistry('minimal');
        const registrar = registry.registeringRegistrar({ registerTool: vi.fn(() => ({}) as never) } as never);
        registrar.registerTool('session.status', { description: 'Return the active Godot MCP session and editor/runtime connection state.', inputSchema: {} } as never, vi.fn() as never);
        expect(() => registry.assertFullyObserved()).toThrow('Undeclared MCP tool catalog entries:');
    });



    it('rejects registration description drift and forwards the canonical description', () => {
        const registerTool = vi.fn(() => ({}) as never);
        const registry = new ToolRegistry('full');
        const registrar = registry.registeringRegistrar({ registerTool } as never);
        expect(() => registrar.registerTool('session.status', { description: 'Drifted session description', inputSchema: {} } as never, vi.fn() as never))
            .toThrow('MCP tool description drift: session.status');
        expect(registerTool).not.toHaveBeenCalled();
        registrar.registerTool('session.status', { inputSchema: {} } as never, vi.fn() as never);
        expect(registerTool).toHaveBeenCalledTimes(1);
        expect(registerTool.mock.calls[0]?.[1]).toMatchObject({
            description: 'Return the active Godot MCP session and editor/runtime connection state.'
        });
    });



    it('rejects a canonical tool that bypasses the canonical binder', () => {
        const registerTool = vi.fn(() => ({}) as never);
        const registry = new ToolRegistry('full');
        const registrar = registry.registeringRegistrar({ registerTool } as never);
        expect(() => registrar.registerTool('godot.tools', { inputSchema: ToolDiscoveryParamsSchema } as never, vi.fn() as never))
            .toThrow('Canonical MCP tool must use bindCanonicalTool: godot.tools');
        expect(registerTool).not.toHaveBeenCalled();
    });

    it('registers a canonical tool from one typed name/schema/handler binding', async () => {
        const registerTool = vi.fn(() => ({}) as never);
        const registry = new ToolRegistry('full');
        const registrar = registry.registeringRegistrar({ registerTool } as never);
        const handler = vi.fn((_context: { prefix: string }, args: { limit: number }) => ({ prefix: _context.prefix, limit: args.limit }));
        const binding = defineCanonicalToolBinding('godot.tools', {
            inputSchema: ToolDiscoveryParamsSchema,
            handler
        });
        bindCanonicalTool(registrar, binding, { prefix: 'ok' });
        expect(registerTool).toHaveBeenCalledTimes(1);
        const [name, config, forwarded] = registerTool.mock.calls[0] as unknown as [string, Record<string | symbol, unknown>, Handler];
        expect(name).toBe('godot.tools');
        expect(config).toMatchObject({
            inputSchema: ToolDiscoveryParamsSchema,
            description: 'Discover bounded Godot MCP tool metadata and profile membership without exposing tool schemas or handlers.'
        });
        expect(Object.getOwnPropertySymbols(config)).toHaveLength(0);
        const result = await forwarded({ limit: 7 }, {} as ServerContext) as CallToolResult;
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toEqual({ prefix: 'ok', limit: 7 });
        expect(handler).toHaveBeenCalledTimes(1);
    });
    it('rejects uncataloged declarations before they reach MCP', () => {
        const registerTool = vi.fn(() => ({}) as never);
        const registry = new ToolRegistry('full');
        const registrar = registry.registeringRegistrar({ registerTool } as never);
        expect(() => registrar.registerTool('physics.future_tool', { description: 'x', inputSchema: {} } as never, vi.fn() as never))
            .toThrow('Uncataloged MCP tool: physics.future_tool');
        expect(registerTool).not.toHaveBeenCalled();
    });
});
