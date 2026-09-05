import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CallToolResult, McpServer, ServerContext } from '@modelcontextprotocol/server';
import { expect, it } from 'vitest';
import { RecoveryService } from '../src/recovery/recovery-service.js';
import { guardedRegistrar, type RiskApprovalState } from '../src/security/tool-registrar.js';
import { ToolPolicy } from '../src/security/tool-policy.js';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';

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
