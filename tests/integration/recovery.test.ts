import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { initProject } from '../../packages/cli/src/init/init-project.js';
import { startClient, stopProcess, waitFor } from './helpers/visual-harness.js';
it('rolls back invalid scene/script publication exactly and restores a file checkpoint through MCP', async () => {
    const godot = process.env.GODOT_BIN;
    if (!godot)
        throw new Error('GODOT_BIN required');
    const parent = path.resolve('.godot-mcp/recovery-test-runs');
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(path.join(parent, 'recovery-'));
    const originalScene = '[gd_scene format=3]\n[node name="Main" type="Node2D"]\nposition = Vector2(2, 3)\n';
    const originalScript = 'extends Node2D\r\nvar speed := 10\r\n';
    await writeFile(path.join(root, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Recovery Fixture"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
    await writeFile(path.join(root, 'main.tscn'), originalScene);
    await writeFile(path.join(root, 'main.gd'), originalScript);
    await initProject({ projectRoot: root, godotBin: godot, enable: true });
    const client = await startClient(root);
    const child = spawn(godot, ['--headless', '--editor', '--path', root, 'res://main.tscn'], { windowsHide: true });
    let log = '';
    child.stdout.on('data', d => log += d);
    child.stderr.on('data', d => log += d);
    const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
    const approve = async (name: string, args: Record<string, unknown> = {}) => { client.setRequestHandler('elicitation/create', async (request) => { expect(request.params.message).toContain(name); return { action: 'accept', content: { confirm: true } }; }); return call(name, args); };
    try {
        await waitFor(async () => (await call('session.status')).structuredContent?.editorConnected === true);
        await waitFor(async () => !!(await call('scene.get_tree')).structuredContent?.root);
        const paths = ['res://main.tscn', 'res://main.gd'];
        expect((await call('transaction.begin', { label: 'open guard', paths })).structuredContent).toMatchObject({ error: { code: 'EDITOR_STATE_CONFLICT' } });
        expect((await approve('editor.close_scene')).structuredContent).toMatchObject({ closed: true });
        const cp = await call('checkpoint.create', { label: 'baseline', paths });
        expect(cp.isError).not.toBe(true);
        const cpId = (cp.structuredContent as any).id;
        const begin = await call('transaction.begin', { label: 'reject broken script', paths });
        expect(begin.isError, JSON.stringify(begin.structuredContent)).not.toBe(true);
        const id = (begin.structuredContent as any).id;
        await call('transaction.write_file', { transaction_id: id, path: paths[0], content: originalScene.replace('2, 3', '52, 63') });
        await call('transaction.write_file', { transaction_id: id, path: paths[1], content: 'extends Node2D\nfunc broken(\n' });
        expect((await call('node.create', { type: 'Node2D', name: 'Blocked' })).structuredContent).toMatchObject({ error: { code: 'TRANSACTION_ACTIVE' } });
        const failed = await approve('transaction.commit', { transaction_id: id });
        expect(failed.isError).toBe(true);
        expect(failed.structuredContent).toMatchObject({ state: 'rolled_back', validation: { valid: false } });
        expect(await readFile(path.join(root, 'main.tscn'), 'utf8')).toBe(originalScene);
        expect(await readFile(path.join(root, 'main.gd'), 'utf8')).toBe(originalScript);
        const again = await call('transaction.begin', { label: 'valid edit', paths });
        const nextId = (again.structuredContent as any).id;
        await call('transaction.write_file', { transaction_id: nextId, path: paths[0], content: originalScene.replace('2, 3', '52, 63') });
        await call('transaction.write_file', { transaction_id: nextId, path: paths[1], content: 'extends Node2D\nvar speed := 20\n' });
        const committed = await approve('transaction.commit', { transaction_id: nextId });
        expect(committed.structuredContent).toMatchObject({ state: 'committed', validation: { valid: true } });
        await call('scene.open', { path: 'res://main.tscn' });
        await waitFor(async () => !!(await call('scene.get_tree')).structuredContent?.root);
        expect((await call('node.get_property', { node_path: '/Main', property: 'position' })).structuredContent).toMatchObject({ value: { x: 52, y: 63 } });
        await approve('editor.close_scene');
        const restored = await approve('checkpoint.restore', { checkpoint_id: cpId });
        expect(restored.structuredContent).toMatchObject({ state: 'committed' });
        expect(await readFile(path.join(root, 'main.tscn'), 'utf8')).toBe(originalScene);
        expect(await readFile(path.join(root, 'main.gd'), 'utf8')).toBe(originalScript);
        const manifest = (await call('session.manifest')).structuredContent?.manifest as any;
        expect(manifest.checkpoints).toContainEqual(expect.objectContaining({ kind: 'files', id: cpId }));
        expect(manifest.transactions).toHaveLength(3);
        const audit = await readFile(path.join(root, '.godot-mcp/sessions', manifest.sessionId, 'logs/audit.jsonl'), 'utf8');
        expect(audit).toContain('transaction.commit');
        expect(audit).not.toContain('func broken(');
        expect((await call('permissions.set', { permission: 'editor.modify', enabled: false })).isError).not.toBe(true);
        expect((await call('node.create', { type: 'Node2D', name: 'Denied' })).structuredContent).toMatchObject({ error: { code: 'PERMISSION_DENIED' } });
        await client.close();
        const fresh = await startClient(root);
        try {
            expect((await fresh.callTool({ name: 'permissions.status', arguments: {} })).structuredContent).toMatchObject({ permissions: { 'editor.modify': true } });
            const previous = await fresh.callTool({ name: 'checkpoint.list', arguments: { session_id: manifest.sessionId } });
            expect((previous.structuredContent as any).checkpoints).toContainEqual(expect.objectContaining({ id: cpId }));
        }
        finally {
            await fresh.close();
        }
        await writeFile(path.join(root, 'evidence.json'), JSON.stringify({ sessionId: manifest.sessionId, transactions: manifest.transactions, checkpoints: manifest.checkpoints }, null, 2));
    }
    finally {
        await client.close();
        await stopProcess(child);
        await writeFile(path.join(root, 'engine.log'), log);
    }
}, 60000);
