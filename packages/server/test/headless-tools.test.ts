import { describe, expect, it, vi } from 'vitest';
import {
  getHeadlessOutput,
  getHeadlessStatus,
  importHeadlessProject,
  runHeadlessProject,
  runHeadlessScene,
  runHeadlessTests,
  stopHeadlessProcess,
  validateHeadlessProject
} from '../src/tools/headless-tools.js';
import type { HeadlessProcessManager } from '../src/headless/headless-process-manager.js';

function fakeManager() {
  return {
    validateProject: vi.fn().mockResolvedValue({ kind: 'validate_project' }),
    importProject: vi.fn().mockResolvedValue({ kind: 'import' }),
    run: vi.fn().mockResolvedValue({ kind: 'run' }),
    runScene: vi.fn().mockResolvedValue({ kind: 'run_scene' }),
    runTests: vi.fn().mockResolvedValue({ kind: 'run_tests' }),
    status: vi.fn().mockResolvedValue({ godotAvailable: false, active: null, last: null }),
    stop: vi.fn().mockResolvedValue({ stopped: false, execution: null }),
    getOutput: vi.fn().mockResolvedValue({ executionId: '00000000-0000-4000-8000-000000000000' })
  };
}

describe('headless tool handlers', () => {
  it('delegates all eight canonical handlers to HeadlessProcessManager with parsed inputs', async () => {
    const manager = fakeManager();
    const context = manager as unknown as HeadlessProcessManager;

    await validateHeadlessProject(context, {});
    await importHeadlessProject(context, {});
    await runHeadlessProject(context, {});
    await runHeadlessScene(context, { scene_path: 'res://main.tscn' });
    await runHeadlessTests(context, { script_path: 'res://tests/smoke.gd' });
    await getHeadlessStatus(context, {});
    await stopHeadlessProcess(context, {});
    await getHeadlessOutput(context, { after: 3, limit: 7 });

    expect(manager.validateProject).toHaveBeenCalledWith({ timeout_ms: 60_000 });
    expect(manager.importProject).toHaveBeenCalledWith({ timeout_ms: 180_000 });
    expect(manager.run).toHaveBeenCalledTimes(1);
    expect(manager.runScene).toHaveBeenCalledWith({ scene_path: 'res://main.tscn' });
    expect(manager.runTests).toHaveBeenCalledWith({ script_path: 'res://tests/smoke.gd', timeout_ms: 120_000 });
    expect(manager.status).toHaveBeenCalledTimes(1);
    expect(manager.stop).toHaveBeenCalledTimes(1);
    expect(manager.getOutput).toHaveBeenCalledWith({ after: 3, limit: 7 });
  });
});
