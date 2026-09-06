import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { expect, test } from 'vitest';
import { initProject } from '../../packages/cli/src/init/init-project.js';

async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null) return value;
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  const final = await probe();
  if (final !== null) return final;
  throw new Error('Headless integration readiness deadline exceeded');
}

test('owns a real Godot 4.6.3 headless lifecycle without authenticating an editor bridge', async () => {
  const godotBin = process.env.GODOT_BIN;
  if (!godotBin) throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');

  const root = await mkdtemp(path.join(os.tmpdir(), 'godot-mcp-headless-integration-'));
  const testsDir = path.join(root, 'tests');
  await mkdir(testsDir, { recursive: true });
  await writeFile(path.join(root, 'project.godot'), [
    'config_version=5',
    '',
    '[application]',
    'config/name="Headless Process Manager Fixture"',
    'run/main_scene="res://tests/headless-persistent.tscn"',
    '',
    '[rendering]',
    'renderer/rendering_method="gl_compatibility"',
    ''
  ].join('\n'));
  await writeFile(path.join(testsDir, 'headless-test-runner.gd'), await readFile(path.resolve('tests/integration/helpers/headless-test-runner.gd'), 'utf8'));
  await writeFile(path.join(testsDir, 'headless-persistent.gd'), await readFile(path.resolve('tests/integration/helpers/headless-persistent.gd'), 'utf8'));
  await writeFile(path.join(testsDir, 'headless-persistent.tscn'), [
    '[gd_scene load_steps=2 format=3]',
    '',
    '[ext_resource type="Script" path="res://tests/headless-persistent.gd" id="1"]',
    '',
    '[node name="HeadlessPersistent" type="Node"]',
    'script = ExtResource("1")',
    ''
  ].join('\n'));

  await initProject({ projectRoot: root, godotBin, enable: true });

  const serverEntry = path.resolve('packages/server/dist/index.js');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry, '--project', root, '--bridge-port', '0', '--tool-profile', 'runtime']
  });
  const client = new Client({ name: 'headless-process-manager-integration', version: '1' }, { capabilities: { elicitation: { form: {} } } });
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
  const approve = async (name: string, args: Record<string, unknown> = {}) => {
    client.setRequestHandler('elicitation/create', async request => {
      expect(request.params.message).toContain(name);
      return { action: 'accept', content: { confirm: true } };
    });
    return call(name, args);
  };
  const expectEditorDisconnected = async () => {
    const status = await call('session.status');
    expect(status.isError).not.toBe(true);
    expect(status.structuredContent).toMatchObject({ editorConnected: false });
  };
  const outputContaining = async (executionId: string, marker: string) => waitFor(async () => {
    const page = await call('headless.get_output', { execution_id: executionId, after: 0, limit: 200 });
    expect(page.isError).not.toBe(true);
    const content = page.structuredContent as any;
    const text = (content.entries ?? []).map((entry: any) => entry.text).join('');
    return text.includes(marker) ? content : null;
  });

  await client.connect(transport);
  try {
    await expectEditorDisconnected();

    const validate = await approve('headless.validate_project');
    expect(validate.isError, JSON.stringify(validate.structuredContent)).not.toBe(true);
    expect(validate.structuredContent).toMatchObject({ kind: 'validate_project', state: 'exited', exitCode: 0, timedOut: false });
    await expectEditorDisconnected();

    const imported = await approve('headless.import');
    expect(imported.isError, JSON.stringify(imported.structuredContent)).not.toBe(true);
    expect(imported.structuredContent).toMatchObject({ kind: 'import', state: 'exited', exitCode: 0, timedOut: false });
    await expectEditorDisconnected();

    const tests = await approve('headless.run_tests', { script_path: 'res://tests/headless-test-runner.gd' });
    expect(tests.isError, JSON.stringify(tests.structuredContent)).not.toBe(true);
    expect(tests.structuredContent).toMatchObject({ kind: 'run_tests', state: 'exited', exitCode: 7, timedOut: false });
    const testExecutionId = String((tests.structuredContent as any).executionId);
    await outputContaining(testExecutionId, 'HEADLESS_TEST_RUNNER_OK');
    await expectEditorDisconnected();

    const run = await approve('headless.run');
    expect(run.isError, JSON.stringify(run.structuredContent)).not.toBe(true);
    expect(run.structuredContent).toMatchObject({ kind: 'run', state: 'running' });
    const runId = String((run.structuredContent as any).executionId);
    await outputContaining(runId, 'HEADLESS_PERSISTENT_READY');
    expect((await call('headless.status')).structuredContent).toMatchObject({ active: { executionId: runId, kind: 'run', state: 'running' } });

    const busy = await approve('headless.run');
    expect(busy.isError).toBe(true);
    expect(busy.structuredContent).toMatchObject({ error: { code: 'HEADLESS_BUSY' } });
    await expectEditorDisconnected();

    const stopped = await approve('headless.stop');
    expect(stopped.isError, JSON.stringify(stopped.structuredContent)).not.toBe(true);
    expect(stopped.structuredContent).toMatchObject({ stopped: true, execution: { executionId: runId, stoppedByRequest: true } });
    expect((await call('headless.status')).structuredContent).toMatchObject({ active: null });

    const scene = await approve('headless.run_scene', { scene_path: 'res://tests/headless-persistent.tscn' });
    expect(scene.isError, JSON.stringify(scene.structuredContent)).not.toBe(true);
    expect(scene.structuredContent).toMatchObject({ kind: 'run_scene', state: 'running', scenePath: 'res://tests/headless-persistent.tscn' });
    const sceneId = String((scene.structuredContent as any).executionId);
    await outputContaining(sceneId, 'HEADLESS_PERSISTENT_READY');
    await approve('headless.stop');
    expect((await call('headless.status')).structuredContent).toMatchObject({ active: null });
    await expectEditorDisconnected();
  } finally {
    try {
      const status = await call('headless.status');
      if ((status.structuredContent as any)?.active) await approve('headless.stop');
    } catch { /* server teardown still owns its child */ }
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
