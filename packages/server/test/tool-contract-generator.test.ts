import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkOrWriteGeneratedArtifacts,
  renderToolCatalog,
  renderToolInventory,
  renderToolPolicy,
  validateContracts
} from '../../../scripts/generate-tool-contracts.mjs';

const sample = {
  schemaVersion: 2,
  tools: [
    {
      name: 'zeta.read',
      domain: 'core',
      profiles: ['core', 'full'],
      description: 'Read zeta state.',
      risk: { tags: ['read'], dynamic: 'none' },
      binding: { status: 'legacy', source: 'packages/server/src/mcp/register-core-tools.ts' }
    },
    {
      name: 'alpha.read',
      domain: 'core',
      profiles: ['minimal', 'core', 'full'],
      description: 'Read alpha state.',
      risk: { tags: ['read', 'control'], dynamic: 'none' },
      binding: { status: 'canonical', source: 'packages/server/src/mcp/register-core-tools.ts', schemaRef: 'AlphaReadSchema', handlerRef: 'readAlpha' }
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
    expect(catalogA).toContain("profiles:Object.freeze(['minimal','core','full']) as readonly ToolProfile[]");
    const inventory = renderToolInventory(contracts);
    expect(inventory).toContain('| `alpha.read` | core | minimal, core, full | normal; read, control; dynamic=none | canonical: packages/server/src/mcp/register-core-tools.ts :: AlphaReadSchema / readAlpha | Read alpha state. |');
    const policy = renderToolPolicy(contracts);
    expect(policy).toContain("READ_TOOL_NAMES=Object.freeze(['alpha.read','zeta.read'])");
    expect(policy).toContain("CONTROL_TOOL_NAMES=Object.freeze(['alpha.read'])");
    expect(() => validateContracts({ ...sample, schemaVersion: 1 }, { expectedCount: 2 })).toThrow(/schemaVersion 2/);
    expect(() => validateContracts({ ...sample, tools: [...sample.tools, sample.tools[0]] }, { expectedCount: 3 })).toThrow(/Duplicate tool contract: zeta\.read/);
    expect(validateContracts({ schemaVersion: 2, tools: [{ ...sample.tools[0], domain: 'headless' }] }, { expectedCount: 1 })[0].domain).toBe('headless');
    expect(() => validateContracts({ schemaVersion: 2, tools: [{ ...sample.tools[0], domain: 'physics' }] }, { expectedCount: 1 })).toThrow(/Unknown tool domain/);
    expect(() => validateContracts({ schemaVersion: 2, tools: [{ ...sample.tools[0], profiles: ['core'] }] }, { expectedCount: 1 })).toThrow(/must include full/);
    expect(() => validateContracts({ schemaVersion: 2, tools: [{ ...sample.tools[0], risk: undefined }] }, { expectedCount: 1 })).toThrow(/Invalid tool risk/);
    expect(() => validateContracts({ schemaVersion: 2, tools: [{ ...sample.tools[0], risk: { tags: ['bogus'], dynamic: 'none' } }] }, { expectedCount: 1 })).toThrow(/Unknown tool risk tag/);
    expect(() => validateContracts({ schemaVersion: 2, tools: [{ ...sample.tools[0], risk: { baseline: 'risky', tags: ['read'], dynamic: 'none' } }] }, { expectedCount: 1 })).toThrow(/risk baseline is derived/i);
    expect(() => validateContracts({ schemaVersion: 2, tools: [{ ...sample.tools[0], binding: { status: 'canonical', source: 'x.ts' } }] }, { expectedCount: 1 })).toThrow(/Canonical tool binding requires schemaRef and handlerRef/);
    expect(contracts[0]).toMatchObject({ risk: { baseline: 'normal', tags: ['read', 'control'], dynamic: 'none' }, binding: { status: 'canonical' } });
  });

  it('rejects a canonical tool whose expected tokens exist but are not paired in its binding definition', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-contract-pairing-'));
    const manifestPath = path.join(root, 'tool-contracts.json');
    const catalogPath = path.join(root, 'tool-catalog.generated.ts');
    const inventoryPath = path.join(root, 'tool-inventory.md');
    const policyPath = path.join(root, 'tool-policy.generated.ts');
    await fs.writeFile(manifestPath, JSON.stringify(sample));
    const bindingSource = path.join(root, 'packages/server/src/mcp/register-core-tools.ts');
    await fs.mkdir(path.dirname(bindingSource), { recursive: true });
    await fs.writeFile(bindingSource, [
      '// zeta.read',
      'const AlphaReadSchema = {};',
      'const readAlpha = () => ({});',
      "const wrong=defineCanonicalToolBinding('alpha.read',{inputSchema:WrongSchema,handler:wrongHandler});"
    ].join('\n'));
    await expect(checkOrWriteGeneratedArtifacts({ manifestPath, catalogPath, inventoryPath, policyPath, check: false, expectedCount: 2, sourceRoot: root }))
      .rejects.toThrow(/Canonical tool binding mismatch for alpha\.read/);
  });

  it('detects stale generated output in check mode without rewriting it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-contract-generator-'));
    const manifestPath = path.join(root, 'tool-contracts.json');
    const catalogPath = path.join(root, 'tool-catalog.generated.ts');
    const inventoryPath = path.join(root, 'tool-inventory.md');
    const policyPath = path.join(root, 'tool-policy.generated.ts');
    await fs.writeFile(manifestPath, JSON.stringify(sample));
    const bindingSource = path.join(root, 'packages/server/src/mcp/register-core-tools.ts');
    await fs.mkdir(path.dirname(bindingSource), { recursive: true });
    await fs.writeFile(bindingSource, "// zeta.read\nconst alphaReadTool=defineCanonicalToolBinding('alpha.read',{inputSchema:AlphaReadSchema,handler:readAlpha});\n");
    await fs.writeFile(catalogPath, 'stale catalog\n');
    await fs.writeFile(inventoryPath, 'stale inventory\n');
    await fs.writeFile(policyPath, 'stale policy\n');
    await expect(checkOrWriteGeneratedArtifacts({ manifestPath, catalogPath, inventoryPath, policyPath, check: true, expectedCount: 2, sourceRoot: root })).rejects.toThrow(/Generated tool artifacts are stale/);
    expect(await fs.readFile(catalogPath, 'utf8')).toBe('stale catalog\n');
    expect(await fs.readFile(inventoryPath, 'utf8')).toBe('stale inventory\n');
    expect(await fs.readFile(policyPath, 'utf8')).toBe('stale policy\n');
    await checkOrWriteGeneratedArtifacts({ manifestPath, catalogPath, inventoryPath, policyPath, check: false, expectedCount: 2, sourceRoot: root });
    await expect(checkOrWriteGeneratedArtifacts({ manifestPath, catalogPath, inventoryPath, policyPath, check: true, expectedCount: 2, sourceRoot: root })).resolves.toMatchObject({ changed: [] });
  });
});

describe('canonical pilot bindings', () => {
  it('registers pilot schemas and handlers only through typed canonical bindings', async () => {
    let definitions = 0;
    for (const relative of [
      '../src/mcp/register-tooling-tools.ts',
      '../src/mcp/register-navigation-tools.ts',
      '../src/mcp/register-power3d-tools.ts',
      '../src/mcp/register-headless-tools.ts',
      '../src/mcp/register-debugger-tools.ts'
    ]) {
      const source = await fs.readFile(new URL(relative, import.meta.url), 'utf8');
      expect(source).not.toContain('description:');
      expect(source).not.toContain('registrar.registerTool(');
      expect(source).toContain('defineCanonicalToolBinding(');
      expect(source).toContain('bindCanonicalTool(');
      definitions += source.match(/defineCanonicalToolBinding\(/g)?.length ?? 0;
    }
    expect(definitions).toBe(39);
  });
});
