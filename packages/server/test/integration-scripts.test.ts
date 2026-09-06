import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('root integration scripts', () => {
  it('builds workspaces before launching any integration suite', async () => {
    const rootPackagePath = path.resolve(process.cwd(), '..', '..', 'package.json');
    const rootPackage = JSON.parse(await readFile(rootPackagePath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    for (const name of ['test:integration', 'test:integration:runtime', 'test:integration:visual']) {
      expect(rootPackage.scripts?.[name]).toMatch(/^npm run build && node scripts\/run-integration\.mjs/);
    }
  });
});

it('provides a dedicated headless integration selection without runtime or visual opt-ins', async () => {
  const runnerPath = path.resolve(process.cwd(), '..', '..', 'scripts', 'run-integration.mjs');
  const source = await readFile(runnerPath, 'utf8');
  expect(source).toContain("process.argv.includes('--headless')");
  expect(source).toContain("['tests/integration/headless-process-manager.test.ts']");
  expect(source).toContain("if(runtime && (process.platform!=='win32'||process.env.GODOT_RUNTIME_INTEGRATION!=='1'))");
  expect(source).toContain("if (visual && (process.platform !== 'win32' || process.env.GODOT_VISUAL_INTEGRATION !== '1'))");
  expect(source).not.toContain('if(headless &&');
  expect(source).not.toContain('if (headless &&');
});
