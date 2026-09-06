import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';
import { RecoveryService } from '../src/recovery/recovery-service.js';
import { ToolPolicy } from '../src/security/tool-policy.js';
async function setup() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-policy-'));
    const session = createSession(root);
    const sessions = new SessionStore(root);
    await sessions.create(session);
    const recovery = new RecoveryService(session, sessions, {
        connected: false,
        rpc: { call: async () => ({}) }
    });
    return { root, session, sessions, recovery, policy: new ToolPolicy(session, sessions, recovery) };
}
it('requires an internal approval fingerprint and rejects a stale approval', async () => {
    const { root, policy } = await setup();
    await fs.writeFile(path.join(root, 'script.gd'), 'original');
    let ran = 0;
    const args = { path: 'res://script.gd', content: 'new' };
    const assessment = await policy.assess('script.create', args);
    expect(assessment.risk).toBe('risky');
    await expect(policy.execute('script.create', args, async () => { ran++; return {}; })).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    expect(ran).toBe(0);
    await policy.execute('script.create', args, async () => { ran++; return {}; }, { approvedFingerprint: assessment.fingerprint });
    expect(ran).toBe(1);
    const stale = await policy.assess('script.create', args);
    await fs.writeFile(path.join(root, 'script.gd'), 'external edit');
    await expect(policy.execute('script.create', args, async () => ({}), { approvedFingerprint: stale.fingerprint })).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
});
it('enforces disabled permissions and resets permissions for a new service instance', async () => {
    const { session, sessions, recovery, policy } = await setup();
    await policy.setPermission('editor.modify', false);
    await expect(policy.execute('node.create', {}, async () => ({}))).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    const state = vi.spyOn(recovery, 'editorState').mockRejectedValue(new Error('Denied calls must not inspect the editor'));
    try {
        await expect(policy.execute('editor.close_scene', {}, async () => ({}))).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    }
    finally {
        state.mockRestore();
    }
    expect(new ToolPolicy(session, sessions, recovery).permissions()['editor.modify']).toBe(true);
});
it('accepts synchronous operations as well as promises', async () => {
    const { policy } = await setup();
    expect(await policy.execute('session.status', {}, () => ({ ok: true }))).toEqual({ ok: true });
});
it('blocks unrelated mutations while a file transaction is open', async () => {
    const { recovery, policy } = await setup();
    await recovery.begin({ label: 'one', paths: ['res://new.json'], atomic: true });
    await expect(policy.execute('node.create', {}, async () => ({}))).rejects.toMatchObject({ code: 'TRANSACTION_ACTIVE' });
    expect(await policy.execute('session.status', {}, async () => ({ ok: true }))).toEqual({ ok: true });
});
it('marks dangerous permission enablement as risky and waits for an executing writer at shutdown', async () => {
    const { policy } = await setup();
    const assessment = await policy.assess('permissions.enable', { permission: 'filesystem.external' });
    expect(assessment.risk).toBe('risky');
    expect(assessment.targets).toContain('permission:filesystem.external');
    await expect(policy.execute('permissions.enable', { permission: 'filesystem.external' }, async () => ({}))).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const began = new Promise<void>(resolve => { started = resolve; });
    const writer = policy.execute('node.create', {}, async () => { started(); await waiting; return {}; });
    await began;
    expect(await policy.execute('runtime.status', {}, async () => ({ state: 'running' }))).toEqual({ state: 'running' });
    let read = false;
    const reader = policy.execute('project.info', {}, async () => { read = true; return {}; });
    const denied = expect(reader).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
    let closed = false;
    const closing = policy.close().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(read).toBe(false);
    expect(closed).toBe(false);
    release();
    await writer;
    await closing;
    await denied;
    await expect(policy.execute('node.create', {}, async () => ({}))).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
});
it('blocks reflective engine escape methods while keeping user methods risky', async () => {
    const { policy } = await setup();
    for (const method of ['_process', 'free', 'queue_free', 'call', 'callv', 'set', 'set_script', 'call_deferred', 'rpc', 'rpc_id', 'add_child', 'remove_child', 'reparent']) {
        const assessment = await policy.assess('object.call', { node_path: '/Main', method, args: [] });
        expect(assessment.risk).toBe('blocked');
        await expect(policy.execute('object.call', { node_path: '/Main', method, args: [] }, async () => ({})))
            .rejects.toMatchObject({ code: 'SAFETY_VIOLATION' });
    }
    const custom = await policy.assess('object.call', {
        node_path: '/Main',
        method: 'recalculate_damage',
        args: []
    });
    expect(custom.risk).toBe('risky');
    expect(custom.targets).toContain('method:recalculate_damage');
});

it('requires approval before undoing or redoing editor history it cannot prove it owns', async () => {
    const { policy } = await setup();
    for (const tool of ['editor.undo', 'editor.redo']) {
        const assessment = await policy.assess(tool, {});
        expect(assessment.risk).toBe('risky');
        expect(assessment.targets).toContain('editor:active_scene');
        await expect(policy.execute(tool, {}, async () => ({ performed: true })))
            .rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    }
});


it('classifies workflow tools with only the permissions of their composed operations', async () => {
    const { policy } = await setup();
    const snapshot = await policy.assess('workflow.snapshot', { capture: 'none' });
    expect(snapshot.risk).toBe('normal');
    expect(snapshot.permissions).toEqual(expect.arrayContaining(['network.local','filesystem.project']));
    expect(snapshot.permissions).not.toContain('editor.modify');
    expect(snapshot.permissions).not.toContain('runtime.modify');

    const run = await policy.assess('workflow.run_check', { target: 'current', capture: true });
    expect(run.risk).toBe('normal');
    expect(run.permissions).toEqual(expect.arrayContaining(['network.local','filesystem.project','runtime.modify','process.godot']));
    expect(run.permissions).not.toContain('editor.modify');

    const diff = await policy.assess('workflow.diff_since', { snapshot_id: '123e4567-e89b-42d3-a456-426614174000' });
    expect(diff.risk).toBe('normal');
    expect(diff.permissions).toEqual(expect.arrayContaining(['network.local','filesystem.project']));
});

it('does not treat Animation track paths as project filesystem paths', async () => {
    const { policy } = await setup();
    const args = {
        player_path: '/Main/AnimationPlayer',
        animation: 'fade',
        type: 'value',
        path: 'HUD:modulate:a'
    };
    const assessment = await policy.assess('animation.add_track', args);
    expect(assessment.risk).toBe('normal');
    expect(assessment.targets).toContain('track_path:HUD:modulate:a');
    expect(assessment.targets).not.toContain('HUD:modulate:a');
    expect(await policy.execute('animation.add_track', args, async () => ({ track_index: 0 })))
        .toEqual({ track_index: 0 });
});

it('fingerprints TileSet atlas texture paths as project files without confusing node paths for files', async () => {
    const { root, policy } = await setup();
    await fs.writeFile(path.join(root, 'tiles.png'), Buffer.from('fixture'));
    const args = {
        node_path: '/Main/Ground',
        texture_path: 'res://tiles.png',
        texture_region_size: { x: 16, y: 16 }
    };
    const assessment = await policy.assess('tileset.add_atlas_source', args);
    expect(assessment.risk).toBe('normal');
    expect(assessment.targets).toContain('res://tiles.png');
    expect(assessment.targets).toContain('node_path:/Main/Ground');
    expect(assessment.targets).not.toContain('/Main/Ground');
});

it('fingerprints Sprite2D texture paths without treating semantic node paths as files', async () => {
    const { root, policy } = await setup();
    await fs.writeFile(path.join(root, 'sprite.png'), Buffer.from('fixture'));
    const args = { node_path: '/Main/Actor/Sprite', texture_path: 'res://sprite.png' };
    const assessment = await policy.assess('sprite2d.set_texture', args);
    expect(assessment.risk).toBe('normal');
    expect(assessment.targets).toContain('res://sprite.png');
    expect(assessment.targets).toContain('node_path:/Main/Actor/Sprite');
    expect(assessment.targets).not.toContain('/Main/Actor/Sprite');
});

describe('Phase 3 material path classification',()=>{
  it('fingerprints material texture paths but treats node_path as semantic context',async()=>{
    const files={
      fingerprint:vi.fn(async(value:string)=>value.includes('missing')?null:`fp:${value}`),
      resolve:vi.fn()
    };
    const recovery={files,activeId:null,editorConnected:false,requireNoBarrier:vi.fn()} as never;
    const sessions={ensureDirectory:vi.fn(async()=>await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-policy-'))),update:vi.fn()} as never;
    const session={id:'phase3',projectRoot:'C:/Project'} as never;
    const policy=new ToolPolicy(session,sessions,recovery);
    const assessment=await policy.assess('material3d.configure_standard',{
      node_path:'/Main/Model',albedo_texture_path:'res://albedo.png',normal_texture_path:'res://normal.png'
    });
    expect(files.fingerprint).toHaveBeenCalledWith('res://albedo.png');
    expect(files.fingerprint).toHaveBeenCalledWith('res://normal.png');
    expect(files.fingerprint).not.toHaveBeenCalledWith('/Main/Model');
    expect(assessment.targets).toContain('node_path:/Main/Model');
  });
});
