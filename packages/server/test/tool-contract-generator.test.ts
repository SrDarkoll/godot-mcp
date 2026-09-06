import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkOrWriteGeneratedArtifacts,
  renderToolCatalog,
  renderToolInventory,
  validateContracts
} from '../../../scripts/generate-tool-contracts.mjs';

const sample = {
  schemaVersion: 1,
  tools: [
    {
      name: 'zeta.read',
      domain: 'core',
      profiles: ['core', 'full'],
      description: 'Read zeta state.'
    },
    {
      name: 'alpha.read',
      domain: 'core',
      profiles: ['minimal', 'core', 'full'],
      description: 'Read alpha state.'
    }
  ]
};

describe('tool contract generator', () => {
  it('wires generated-contract checking into the normal root build gate', async () => {
    const packageJson = JSON.parse(await fs.readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
    expect(packageJson.scripts['generate:tool-contracts']).toBe('node scripts/generate-tool-contracts.mjs');
    expect(packageJson.scripts['check:tool-contracts']).toBe('node scripts/generate-tool-contracts.mjs --check');
    expect(packageJson.scripts.build).toMatch(/^npm run check:tool-contracts && /);
  });

  it('validates bounded metadata and renders deterministic alphabetical artifacts', () => {
    const contracts = validateContracts(sample, { expectedCount: 2 });
    expect(contracts.map(contract => contract.name)).toEqual(['alpha.read', 'zeta.read']);
    const catalogA = renderToolCatalog(contracts);
    const catalogB = renderToolCatalog(validateContracts(sample, { expectedCount: 2 }));
    expect(catalogA).toBe(catalogB);
    expect(catalogA.indexOf("name:'alpha.read'")).toBeLessThan(catalogA.indexOf("name:'zeta.read'"));
    const inventory = renderToolInventory(contracts);
    expect(inventory).toContain('| `alpha.read` | core | minimal, core, full | Read alpha state. |');
    expect(() => validateContracts({ ...sample, tools: [...sample.tools, sample.tools[0]] }, { expectedCount: 3 })).toThrow(/Duplicate tool contract: zeta\.read/);
    expect(() => validateContracts({ schemaVersion: 1, tools: [{ ...sample.tools[0], domain: 'physics' }] }, { expectedCount: 1 })).toThrow(/Unknown tool domain/);
    expect(() => validateContracts({ schemaVersion: 1, tools: [{ ...sample.tools[0], profiles: ['core'] }] }, { expectedCount: 1 })).toThrow(/must include full/);
  });

  it('detects stale generated output in check mode without rewriting it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-contract-generator-'));
    const manifestPath = path.join(root, 'tool-contracts.json');
    const catalogPath = path.join(root, 'tool-catalog.generated.ts');
    const inventoryPath = path.join(root, 'tool-inventory.md');
    await fs.writeFile(manifestPath, JSON.stringify(sample));
    await fs.writeFile(catalogPath, 'stale catalog\n');
    await fs.writeFile(inventoryPath, 'stale inventory\n');
    await expect(checkOrWriteGeneratedArtifacts({ manifestPath, catalogPath, inventoryPath, check: true, expectedCount: 2 })).rejects.toThrow(/Generated tool artifacts are stale/);
    expect(await fs.readFile(catalogPath, 'utf8')).toBe('stale catalog\n');
    expect(await fs.readFile(inventoryPath, 'utf8')).toBe('stale inventory\n');
    await checkOrWriteGeneratedArtifacts({ manifestPath, catalogPath, inventoryPath, check: false, expectedCount: 2 });
    await expect(checkOrWriteGeneratedArtifacts({ manifestPath, catalogPath, inventoryPath, check: true, expectedCount: 2 })).resolves.toMatchObject({ changed: [] });
  });
});
