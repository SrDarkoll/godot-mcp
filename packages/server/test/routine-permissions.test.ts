import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import { RecoveryService } from '../src/recovery/recovery-service.js';
import { guardedRegistrar } from '../src/security/tool-registrar.js';
import { ToolPolicy } from '../src/security/tool-policy.js';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';
import { registerRecoveryTools } from '../src/tools/recovery-tools.js';

type Handler = (args: Record<string, unknown>, context: ServerContext) => Promise<any>;

async function setup() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-routine-'));
    await fs.writeFile(path.join(root, 'project.godot'), 'config_version=5\n');
    await fs.writeFile(path.join(root, 'main.tscn'), '[gd_scene format=3]\n[node name="Main" type="Node2D"]\n');
    await fs.writeFile(path.join(root, 'globals.gd'), 'extends Node\n');
    const session = createSession(root);
    const sessions = new SessionStore(root);
    await sessions.create(session);
    const recovery = new RecoveryService(session, sessions, { connected: false, rpc: { call: async () => ({}) } });
    const policy = new ToolPolicy(session, sessions, recovery);
    const handlers = new Map<string, Handler>();
    const configs = new Map<string, any>();
    const registrar = guardedRegistrar({
        registerTool(name: string, config: unknown, handler: Handler) {
            handlers.set(name, handler);
            configs.set(name, config);
            return {};
        }
    } as unknown as McpServer, policy, { mint: async payload => JSON.stringify(payload) });
    const context = { mcpReq: { method: 'tools/call', requestState: () => undefined } } as unknown as ServerContext;
    const operation = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }], structuredContent: { ok: true } }));
    const register = (name: string) => registrar.registerTool(name, { inputSchema: {} } as never, operation as never);
    return { root, policy, recovery, handlers, configs, registrar, context, operation, register };
}

describe('routine project work', () => {
    it('runs common settings directly through the guarded registrar without elicitation', async () => {
        const { register, handlers, context, operation } = await setup();
        register('project.settings.set');
        for (const [setting, value] of [
            ['application/config/name', 'BLACKOUT'],
            ['application/run/main_scene', 'res://main.tscn'],
            ['autoload/GameGlobals', '*res://globals.gd'],
            ['autoload/SceneRouter', null],
            ['display/window/size/viewport_width', 640],
            ['display/window/size/viewport_height', 360],
            ['display/window/stretch/mode', 'canvas_items'],
            ['display/window/stretch/aspect', 'keep'],
            ['rendering/textures/canvas_textures/default_texture_filter', 0]
        ]) {
            const response = await handlers.get('project.settings.set')!({ setting, value }, context);
            expect(response.inputRequests, String(setting)).toBeUndefined();
            expect(response.isError, String(setting)).not.toBe(true);
            expect(response.structuredContent, String(setting)).toEqual({ ok: true });
        }
        expect(operation).toHaveBeenCalledTimes(9);
    });

    it.each(['headless.validate_project', 'headless.import', 'headless.run', 'headless.run_scene', 'headless.run_tests', 'headless.stop'])(
        'executes %s with existing project/Godot permissions and no extra approval', async name => {
            const { register, handlers, context, operation } = await setup();
            register(name);
            const args = name === 'headless.run_scene' ? { scene_path: 'res://main.tscn' }
                : name === 'headless.run_tests' ? { script_path: 'res://globals.gd' } : {};
            const response = await handlers.get(name)!(args, context);
            expect(response.inputRequests).toBeUndefined();
            expect(response.isError).not.toBe(true);
            expect(operation).toHaveBeenCalledOnce();
        }
    );

    it('closes with the safe default and still asks before explicit discard', async () => {
        const { policy, handlers, configs, context, registrar, recovery } = await setup();
        const call = vi.fn(async (method: string) => method === 'recovery.editor_state'
            ? { path: 'res://main.tscn', safeCloseSupported: true } : { closed: true, saved: true });
        registerRecoveryTools(registrar, recovery, { call } as never);
        expect(configs.get('editor.close_scene').inputSchema.safeParse({ discard_changes: true }).success).toBe(true);
        const close = handlers.get('editor.close_scene')!;
        const normal = await close({}, context);
        expect(normal.inputRequests).toBeUndefined();
        expect(normal.isError).not.toBe(true);
        expect(call).toHaveBeenCalledWith('editor.close_scene', {});
        const explicitFalse = await close({ discard_changes: false }, context);
        expect(explicitFalse.inputRequests).toBeUndefined();
        expect(call).toHaveBeenCalledWith('editor.close_scene', { discard_changes: false });
        const discard = await close({ discard_changes: true }, context);
        expect(discard.inputRequests?.riskApproval).toBeDefined();
        expect(call.mock.calls.filter(([method]) => method === 'editor.close_scene')).toHaveLength(2);
        expect((await policy.assess('editor.close_scene', { discard_changes: true })).risk).toBe('risky');
    });

    it('never sends an unapproved close to an old addon that cannot guarantee saving', async () => {
        const { registrar, recovery, handlers, context } = await setup();
        const call = vi.fn(async () => ({ path: 'res://main.tscn', version: 3 }));
        registerRecoveryTools(registrar, recovery, { call } as never);
        const response = await handlers.get('editor.close_scene')!({}, context);
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toMatchObject({ error: { code: 'CAPABILITY_UNAVAILABLE' } });
        expect(call).toHaveBeenCalledExactlyOnceWith('recovery.editor_state', {});
    });

    it.each([
        ['editor.modify', 'project.settings.set', { setting: 'application/config/name', value: 'Name' }],
        ['editor.modify', 'editor.close_scene', {}],
        ['process.godot', 'headless.run_tests', { script_path: 'res://globals.gd' }],
        ['filesystem.project', 'headless.import', {}]
    ] as const)('does not bypass disabled %s for %s', async (permission, name, args) => {
        const { policy, register, handlers, context, operation } = await setup();
        await policy.setPermission(permission, false);
        register(name);
        const response = await handlers.get(name)!(args, context);
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toMatchObject({ error: { code: 'PERMISSION_DENIED' } });
        expect(response.inputRequests).toBeUndefined();
        expect(operation).not.toHaveBeenCalled();
    });

    it.each([
        ['editor_plugins/enabled', ['res://addons/untrusted/plugin.cfg']],
        ['application/run/main_scene', 'C:/outside/main.tscn'],
        ['application/run/main_scene', 'res://missing.tscn'],
        ['application/run/main_scene', 'res://../outside.tscn'],
        ['application/run/main_scene', { type: 'Resource', value: { path: 'res://main.tscn' } }],
        ['autoload/GodotMcpRuntime', null],
        ['autoload/GameGlobals', '*res://addons/godot_mcp/runtime/runtime_autoload.gd'],
        ['autoload/GameGlobals', 'user://outside.gd'],
        ['display/window/size/viewport_width', -1],
        ['display/window/size/viewport_height', 1.5],
        ['display/window/stretch/mode', 'bad-mode'],
        ['rendering/textures/canvas_textures/default_texture_filter', 99],
        ['application/config/name', { type: 'Object', value: 'bad' }]
    ])('keeps non-routine or unsafe setting %s guarded', async (setting, value) => {
        const { policy, register, handlers, context, operation } = await setup();
        register('project.settings.set');
        const args = { setting, value };
        expect((await policy.assess('project.settings.set', args)).risk).not.toBe('normal');
        const response = await handlers.get('project.settings.set')!(args, context);
        expect(response.inputRequests?.riskApproval).toBeDefined();
        expect(operation).not.toHaveBeenCalled();
    });

    it('rejects a hard-linked main scene from the routine-setting allowlist', async () => {
        const { root, policy } = await setup();
        await fs.link(path.join(root, 'main.tscn'), path.join(root, 'linked.tscn'));
        const assessment = await policy.assess('project.settings.set', {
            setting: 'application/run/main_scene', value: 'res://linked.tscn'
        });
        expect(assessment.risk).not.toBe('normal');
    });

    it('retains external-permission, overwrite, reflection and unknown-history approval gates', async () => {
        const { policy } = await setup();
        for (const [name, args] of [
            ['permissions.enable', { permission: 'process.shell' }],
            ['script.create', { path: 'res://globals.gd', template: 'extends Node' }],
            ['editor.undo', {}],
            ['editor.redo', {}],
            ['object.call', { node_path: '/Main', method: 'user_action' }]
        ] as const) expect((await policy.assess(name, args)).risk, name).toBe('risky');
    });
});
