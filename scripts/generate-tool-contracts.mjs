import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_PROFILES = ['minimal','core','2d','3d','navigation','ui','runtime','full'];
const TOOL_DOMAINS = [
  'core','session','security','recovery','scene','node','object','resource','script','signal','project','editor',
  'runtime','debug','visual','workflow','ui','animation','tilemap','tileset','2d','3d','materials','navigation'
];
const DEFAULT_EXPECTED_COUNT = 165;

function fail(message) { throw new Error(message); }
function asStringArray(value, field, name) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || !item.trim())) {
    fail(`Invalid ${field} for tool contract: ${name}`);
  }
  return value.map(item => item.trim());
}

export function validateContracts(raw, options = {}) {
  const expectedCount = options.expectedCount ?? DEFAULT_EXPECTED_COUNT;
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1 || !Array.isArray(raw.tools)) {
    fail('Invalid tool contract manifest: expected schemaVersion 1 with tools array');
  }
  if (raw.tools.length !== expectedCount) {
    fail(`Invalid tool contract count: expected ${expectedCount}, received ${raw.tools.length}`);
  }
  const seen = new Set();
  const contracts = raw.tools.map((item, index) => {
    if (!item || typeof item !== 'object') fail(`Invalid tool contract at index ${index}`);
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const domain = typeof item.domain === 'string' ? item.domain.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    if (!name) fail(`Invalid tool contract name at index ${index}`);
    if (seen.has(name)) fail(`Duplicate tool contract: ${name}`);
    seen.add(name);
    if (!TOOL_DOMAINS.includes(domain)) fail(`Unknown tool domain for ${name}: ${domain}`);
    if (!description) fail(`Invalid tool description: ${name}`);
    const profiles = asStringArray(item.profiles, 'profiles', name);
    if (new Set(profiles).size !== profiles.length) fail(`Duplicate profile membership for ${name}`);
    for (const profile of profiles) {
      if (!TOOL_PROFILES.includes(profile)) fail(`Unknown tool profile for ${name}: ${profile}`);
    }
    if (!profiles.includes('full')) fail(`Tool contract must include full profile: ${name}`);
    const orderedProfiles = TOOL_PROFILES.filter(profile => profiles.includes(profile));
    return Object.freeze({ name, domain, profiles: Object.freeze(orderedProfiles), description });
  });
  contracts.sort((a, b) => a.name.localeCompare(b.name));
  return Object.freeze(contracts);
}

function tsString(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\r', '\\r').replaceAll('\n', '\\n')}'`;
}

export function renderToolCatalog(contracts) {
  const rows = contracts.map(contract => {
    const profiles = contract.profiles.map(tsString).join(',');
    return `  Object.freeze({name:${tsString(contract.name)},domain:${tsString(contract.domain)},profiles:Object.freeze([${profiles}]),description:${tsString(contract.description)}}),`;
  }).join('\n');
  return `// GENERATED FILE. DO NOT EDIT.\n// Source: scripts/tool-contracts.json\n\nimport type { ToolDomain, ToolProfile } from '@godot-mcp/protocol';\n\nexport const TOOL_PROFILES = Object.freeze([${TOOL_PROFILES.map(tsString).join(',')}]) as readonly ToolProfile[];\n\nexport interface StaticToolCatalogEntry {\n  readonly name:string;\n  readonly domain:ToolDomain;\n  readonly profiles:readonly ToolProfile[];\n  readonly description:string;\n}\n\nexport const TOOL_CATALOG = Object.freeze([\n${rows}\n]) satisfies readonly StaticToolCatalogEntry[];\n\nconst byName = new Map<string,StaticToolCatalogEntry>(TOOL_CATALOG.map(entry=>[entry.name,entry]));\n\nexport function toolCatalogEntry(name:string):StaticToolCatalogEntry|undefined{return byName.get(name);}\nexport function toolNamesForProfile(profile:ToolProfile):string[]{return TOOL_CATALOG.filter(entry=>entry.profiles.includes(profile)).map(entry=>entry.name);}\n`;
}

function md(value) {
  return value.replaceAll('|', '\\|').replaceAll('\r', ' ').replaceAll('\n', ' ');
}

export function renderToolInventory(contracts) {
  const counts = Object.fromEntries(TOOL_PROFILES.map(profile => [profile, contracts.filter(contract => contract.profiles.includes(profile)).length]));
  const summary = TOOL_PROFILES.map(profile => `- \`${profile}\`: ${counts[profile]}`).join('\n');
  const rows = contracts.map(contract => `| \`${md(contract.name)}\` | ${md(contract.domain)} | ${contract.profiles.map(md).join(', ')} | ${md(contract.description)} |`).join('\n');
  return `# Generated Godot MCP Tool Inventory\n\n> **Generated file. Do not edit directly.** Source: \`scripts/tool-contracts.json\`. Regenerate with \`npm run generate:tool-contracts\`.\n\nTotal public tools: **${contracts.length}**\n\n## Profile counts\n\n${summary}\n\n## Tools\n\n| Tool | Domain | Profiles | Description |\n| --- | --- | --- | --- |\n${rows}\n`;
}

async function readManifest(manifestPath, expectedCount) {
  const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return validateContracts(raw, { expectedCount });
}

async function sameFile(filePath, expected) {
  try { return await fs.readFile(filePath, 'utf8') === expected; }
  catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function checkOrWriteGeneratedArtifacts(options = {}) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '..');
  const manifestPath = options.manifestPath ?? path.join(root, 'scripts', 'tool-contracts.json');
  const catalogPath = options.catalogPath ?? path.join(root, 'packages', 'server', 'src', 'tooling', 'tool-catalog.generated.ts');
  const inventoryPath = options.inventoryPath ?? path.join(root, 'docs', 'generated', 'tool-inventory.md');
  const check = options.check ?? false;
  const expectedCount = options.expectedCount ?? DEFAULT_EXPECTED_COUNT;
  const contracts = await readManifest(manifestPath, expectedCount);
  const outputs = [
    [catalogPath, renderToolCatalog(contracts)],
    [inventoryPath, renderToolInventory(contracts)]
  ];
  const changed = [];
  for (const [filePath, content] of outputs) {
    if (!(await sameFile(filePath, content))) changed.push(filePath);
  }
  if (check && changed.length) {
    fail(`Generated tool artifacts are stale: ${changed.map(filePath => path.relative(root, filePath) || filePath).join(', ')}`);
  }
  if (!check) {
    for (const [filePath, content] of outputs) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
    }
  }
  return { contracts, changed };
}

async function main() {
  const check = process.argv.slice(2).includes('--check');
  const result = await checkOrWriteGeneratedArtifacts({ check });
  if (check) console.log(`Tool contract artifacts are current (${result.contracts.length} tools).`);
  else console.log(`Generated tool contract artifacts (${result.contracts.length} tools).`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
