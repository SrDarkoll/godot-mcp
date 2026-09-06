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
