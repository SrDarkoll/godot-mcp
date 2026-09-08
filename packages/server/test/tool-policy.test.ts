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
it('classifies godot.capabilities as a normal read-only operation', async () => {
    const { policy } = await setup();
    const assessment = await policy.assess('godot.capabilities', {});
    expect(assessment.risk).toBe('normal');
    expect(assessment.permissions).not.toContain('editor.modify');
});
it('classifies godot.tools as a local read-only operation', async () => {
    const { policy } = await setup();
    const assessment = await policy.assess('godot.tools', {});
    expect(assessment.risk).toBe('normal');
    expect(assessment.permissions).toEqual([]);
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


it('treats navigation source roots as semantic node paths instead of filesystem paths',async()=>{
  const {policy}=await setup();
  const assessment=await policy.assess('navigation.mesh.bake',{node_path:'/Main/Region',source_root_path:'/Main/Source'});
  expect(assessment.risk).toBe('normal');
  expect(assessment.targets).toContain('node_path:/Main/Region');
  expect(assessment.targets).toContain('source_root_path:/Main/Source');
  expect(assessment.targets).not.toContain('/Main/Region');
  expect(assessment.targets).not.toContain('/Main/Source');
});

it('sources static risk classifications from generated contract metadata', async () => {
    const source = await fs.readFile(new URL('../src/security/tool-policy.ts', import.meta.url), 'utf8');
    expect(source).toContain("from './tool-policy.generated.js'");
    expect(source).not.toMatch(/const READS = new Set\(\[/);
    expect(source).not.toMatch(/const CONTROLS = new Set\(\[/);
    expect(source).not.toMatch(/const NORMAL_MUTATIONS = new Set\(\[/);
});

it('classifies headless process operations with only project and Godot process permissions', async () => {
    const { policy } = await setup();
    const status = await policy.assess('headless.status', {});
    const output = await policy.assess('headless.get_output', {});
    expect(status.risk).toBe('normal');
    expect(status.permissions).toEqual([]);
    expect(output.risk).toBe('normal');
    expect(output.permissions).toEqual([]);

    const cases: Array<[string, Record<string, unknown>]> = [
        ['headless.validate_project', {}],
        ['headless.import', {}],
        ['headless.run', {}],
        ['headless.run_scene', { scene_path: 'res://main.tscn' }],
        ['headless.run_tests', { script_path: 'res://tests/smoke.gd' }],
        ['headless.stop', {}]
    ];
    for (const [name, args] of cases) {
        const assessment = await policy.assess(name, args);
        expect(assessment.risk, name).toBe('risky');
        expect(assessment.permissions, name).toEqual(['filesystem.project', 'process.godot']);
        expect(assessment.permissions, name).not.toContain('network.local');
        expect(assessment.permissions, name).not.toContain('process.shell');
        expect(assessment.permissions, name).not.toContain('process.external');
        expect(assessment.permissions, name).not.toContain('editor.modify');
        expect(assessment.permissions, name).not.toContain('runtime.modify');
        if (['headless.validate_project','headless.import','headless.run'].includes(name))
            expect(assessment.targets, name).toContain('res://project.godot');
        if (name === 'headless.run_scene') expect(assessment.targets).toContain('res://main.tscn');
        if (name === 'headless.run_tests') expect(assessment.targets).toContain('res://tests/smoke.gd');
    }
});

it('blocks headless process execution before the operation when a required process permission is disabled', async () => {
    for (const permission of ['process.godot', 'filesystem.project'] as const) {
        const { policy } = await setup();
        await policy.setPermission(permission, false);
        const operation = vi.fn(async () => ({ started: true }));
        const assessment = await policy.assess('headless.run', {});
        expect(assessment.risk, permission).toBe('blocked');
        expect(assessment.permissions, permission).toEqual(['filesystem.project', 'process.godot']);
        await expect(policy.execute('headless.run', {}, operation)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
        expect(operation, permission).not.toHaveBeenCalled();
    }
});

it('keeps headless observation and stop available during an open transaction while blocking new starts', async () => {
    const { recovery, policy } = await setup();
    await recovery.begin({ label: 'headless-barrier', paths: ['res://staged.txt'], atomic: true });

    const observe = vi.fn(async () => ({ ok: true }));
    await expect(policy.execute('headless.status', {}, observe)).resolves.toEqual({ ok: true });
    await expect(policy.execute('headless.get_output', {}, observe)).resolves.toEqual({ ok: true });

    for (const [name, args] of [
        ['headless.validate_project', {}],
        ['headless.import', {}],
        ['headless.run', {}],
        ['headless.run_scene', { scene_path: 'res://main.tscn' }],
        ['headless.run_tests', { script_path: 'res://tests/smoke.gd' }]
    ] as Array<[string, Record<string, unknown>]>) {
        await expect(policy.execute(name, args, async () => ({ started: true }))).rejects.toMatchObject({ code: 'TRANSACTION_ACTIVE' });
    }

    const stopAssessment = await policy.assess('headless.stop', {});
    await expect(policy.execute('headless.stop', {}, async () => ({ stopped: true }), { approvedFingerprint: stopAssessment.fingerprint }))
        .resolves.toEqual({ stopped: true });
});


it('keeps headless observation and stop available during recovery barriers while start operations fail closed', async () => {
    const { recovery, policy } = await setup();
    const barrierError = Object.assign(new Error('recovery required'), { code: 'RECOVERY_REQUIRED' });
    const barrier = vi.spyOn(recovery, 'requireNoBarrier').mockRejectedValue(barrierError);

    await expect(policy.execute('headless.status', {}, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
    await expect(policy.execute('headless.get_output', {}, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
    const stopAssessment = await policy.assess('headless.stop', {});
    await expect(policy.execute('headless.stop', {}, async () => ({ stopped: true }), { approvedFingerprint: stopAssessment.fingerprint }))
        .resolves.toEqual({ stopped: true });
    expect(barrier).not.toHaveBeenCalled();

    await expect(policy.execute('headless.run', {}, async () => ({ started: true }))).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
    expect(barrier).toHaveBeenCalledTimes(1);
});

it('binds headless.stop approval fingerprints and targets to the active execution id', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-policy-headless-stop-'));
    const session = createSession(root);
    const sessions = new SessionStore(root);
    await sessions.create(session);
    const recovery = new RecoveryService(session, sessions, { connected: false, rpc: { call: async () => ({}) } });
    let executionId = '11111111-1111-4111-8111-111111111111';
    const policy = new ToolPolicy(session, sessions, recovery, async () => ({ active: { executionId } }));

    const first = await policy.assess('headless.stop', {});
    expect(first.risk).toBe('risky');
    expect(first.targets).toContain(`execution:${executionId}`);

    executionId = '22222222-2222-4222-8222-222222222222';
    const second = await policy.assess('headless.stop', {});
    expect(second.targets).toContain(`execution:${executionId}`);
    expect(second.fingerprint).not.toBe(first.fingerprint);
});


it('classifies advanced debugger reads and mutations with exact permissions and no elicitation risk',async()=>{
  const {policy}=await setup();
  for(const name of ['debug.breakpoint.list','debug.stack','debug.variables','debug.expand']){
    const args=name==='debug.variables'?{frame_id:'11111111-1111-4111-8111-111111111111'}:name==='debug.expand'?{variable_ref:'22222222-2222-4222-8222-222222222222',start:0,limit:100}:{};
    const assessment=await policy.assess(name,args);
    expect(assessment.risk,name).toBe('normal');
    expect(assessment.permissions,name).not.toContain('runtime.modify');
    expect(assessment.permissions,name).not.toContain('editor.modify');
  }
  for(const name of ['debug.breakpoint.set','debug.breakpoint.remove']){
    const assessment=await policy.assess(name,{script_path:'res://player.gd',line:7});
    expect(assessment.risk,name).toBe('normal');
    expect(assessment.permissions,name).toEqual(expect.arrayContaining(['network.local','filesystem.project','editor.modify']));
    expect(assessment.permissions,name).not.toContain('runtime.modify');
  }
  for(const name of ['debug.continue','debug.step_into','debug.step_over','debug.step_out']){
    const assessment=await policy.assess(name,{});
    expect(assessment.risk,name).toBe('normal');
    expect(assessment.permissions,name).toEqual(expect.arrayContaining(['network.local','filesystem.project','runtime.modify','process.godot']));
    expect(assessment.permissions,name).not.toContain('editor.modify');
  }
});

it('blocks debugger mutations on their exact permissions before handler execution',async()=>{
  {
    const {policy}=await setup();await policy.setPermission('runtime.modify',false);const operation=vi.fn(async()=>({accepted:true}));
    for(const name of ['debug.continue','debug.step_into','debug.step_over','debug.step_out']){
      await expect(policy.execute(name,{},operation)).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    }
    expect(operation).not.toHaveBeenCalled();
  }
  {
    const {policy}=await setup();await policy.setPermission('editor.modify',false);const operation=vi.fn(async()=>({ok:true}));
    await expect(policy.execute('debug.breakpoint.set',{script_path:'res://x.gd',line:1},operation)).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    await expect(policy.execute('debug.breakpoint.remove',{script_path:'res://x.gd',line:1},operation)).rejects.toMatchObject({code:'PERMISSION_DENIED'});
    expect(operation).not.toHaveBeenCalled();
  }
});

it('does not grant debugger stepping shutdown-control privileges',async()=>{
  const source=await fs.readFile(new URL('../src/security/tool-policy.generated.ts',import.meta.url),'utf8');
  for(const name of ['debug.continue','debug.step_into','debug.step_over','debug.step_out'])expect(source).not.toMatch(new RegExp(`CONTROL_TOOL_NAMES=.*${name.replace('.','\\.')}`));
  const {policy}=await setup();await policy.close();
  for(const name of ['debug.continue','debug.step_into','debug.step_over','debug.step_out']){
    await expect(policy.execute(name,{},async()=>({accepted:true}))).rejects.toMatchObject({code:'SESSION_CLOSED'});
  }
});

it('rejects cyclic and deep inputs before fingerprinting or execution', async () => {
  const { policy } = await setup();
  const cycle: any = {};
  cycle.self = cycle;
  await expect(policy.execute('node.create', { value: cycle }, async () => ({}))).rejects.toMatchObject({ code: 'ARGUMENT_TOO_LARGE' });
  await expect(policy.assess('node.create', { value: cycle })).rejects.toMatchObject({ code: 'ARGUMENT_TOO_LARGE' });

  let deep: any = 0;
  for (let i = 0; i < 80; i++) deep = [deep];
  await expect(policy.execute('node.create', { value: deep }, async () => ({}))).rejects.toMatchObject({ code: 'ARGUMENT_TOO_LARGE' });
  await expect(policy.assess('node.create', { value: deep })).rejects.toMatchObject({ code: 'ARGUMENT_TOO_LARGE' });
});

