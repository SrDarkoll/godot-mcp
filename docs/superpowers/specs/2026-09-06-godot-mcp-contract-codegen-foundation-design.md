# Godot MCP Contract & Codegen Foundation Design

## Goal

Make public MCP tool metadata mechanically consistent as the project scales past 165 tools by introducing one canonical static contract source and deterministic generated artifacts, without generating execution logic or changing existing tool behavior.

## Scope

Phase 7 adds:

- one canonical static contract manifest for every public MCP tool containing `name`, `domain`, `profiles`, and `description`;
- deterministic code generation for the runtime tool catalog and a human-readable tool inventory;
- a `--check` mode that fails when committed generated artifacts do not match the canonical manifest;
- normal build integration so stale generated artifacts fail the standard `npm run build` gate;
- runtime registration validation that rejects uncataloged tools and description drift;
- tests proving generated output is deterministic, profile counts remain unchanged, and the full server still exposes exactly the Phase 6 surface;
- documentation describing which metadata is canonical and which implementation details remain hand-authored.

Phase 7 does **not**:

- generate GDScript handlers;
- generate TypeScript tool handlers;
- generate Zod input schemas;
- infer or generate security/risk decisions;
- add, remove, rename, or merge public MCP tools;
- change tool profiles or capability semantics;
- add Physics, Audio, Particles, Environment, or another vertical domain.

## Architectural principles

1. **Static metadata has one source of truth.** Tool name, domain, profile membership, and public description are authored once.
2. **Execution logic stays specialized.** Input schemas, server wrappers, RPC calls, Undo/Redo behavior, and Godot handlers remain explicit code.
3. **Generated files are committed but never hand-edited.** This keeps normal TypeScript builds simple and makes diffs inspectable.
4. **Generation is deterministic.** Same manifest produces byte-identical TypeScript and Markdown on Windows/Linux.
5. **Builds fail on drift.** `npm run build` runs the generated-artifact check before compiling workspaces.
6. **Runtime fails closed on declaration drift.** Registering an unknown tool or a conflicting description throws during server construction.
7. **Phase 6 behavior is preserved.** `full` remains 165 tools and all profile counts stay `5/78/121/107/67/81/30/165`.

## Architecture

```text
scripts/tool-contracts.json
         |
         v
scripts/generate-tool-contracts.mjs
     /                         \
    v                           v
packages/server/src/        docs/generated/
tooling/tool-catalog.       tool-inventory.md
generated.ts
    |
    v
ToolRegistry
    |
    +--> profile filtering / godot.tools
    |
    +--> registration validation
```

The canonical manifest intentionally contains only metadata that is stable and suitable for generation:

```json
{
  "name": "navigation.mesh.bake",
  "domain": "navigation",
  "profiles": ["2d", "3d", "navigation", "full"],
  "description": "Copy-on-write parse and synchronously bake navigation geometry from an explicit scene source root."
}
```

It does not contain executable functions, arbitrary code strings, Zod schemas, RPC handlers, or Godot source.

## Canonical contract source

The source file is `scripts/tool-contracts.json`.

The generator validates before producing output:

- exact known profile IDs;
- exact known domain IDs;
- unique non-empty tool names;
- non-empty descriptions;
- every tool has at least one profile;
- every tool includes `full`;
- deterministic alphabetical ordering by tool name;
- exactly 165 Phase 6 tool contracts in this phase.

The generator owns normalization and formatting. Humans edit only the source JSON when static metadata changes.

## Generated runtime catalog

`scripts/generate-tool-contracts.mjs` writes:

`packages/server/src/tooling/tool-catalog.generated.ts`

The generated module exports:

```ts
export interface StaticToolCatalogEntry {
  readonly name: string;
  readonly domain: ToolDomain;
  readonly profiles: readonly ToolProfile[];
  readonly description: string;
}

export const TOOL_PROFILES = [...];
export const TOOL_CATALOG = [...];
export function toolCatalogEntry(name: string): StaticToolCatalogEntry | undefined;
export function toolNamesForProfile(profile: ToolProfile): string[];
```

The existing hand-authored `tool-catalog.ts` becomes a narrow re-export/compatibility module so imports do not churn unnecessarily.

## Generated documentation

The same generator writes:

`docs/generated/tool-inventory.md`

The inventory contains:

- generation warning;
- total tool count;
- exact profile counts;
- one deterministic table containing name, domain, profiles, and description.

This is an inventory, not a replacement for curated domain guides such as Navigation or 3D Materials.

## Runtime registration contract

`ToolRegistry` stops learning descriptions from registrar execution. Discovery reads the canonical generated description.

When a registration declaration executes:

1. the name must exist in `TOOL_CATALOG`;
2. the declaration is marked observed;
3. if the registrar still supplies a description, it must exactly equal the canonical description after trimming;
4. the canonical description is forwarded to MCP registration;
5. profile filtering remains unchanged.

This gives a safe migration path. Existing registrar files may continue to carry descriptions temporarily, but those copies cannot silently diverge. Later phases can mechanically remove them and rely on a contract-aware helper without changing the public contract.

## Codegen commands

Root scripts gain:

```text
npm run generate:tool-contracts
npm run check:tool-contracts
```

`generate:tool-contracts` writes the two generated artifacts.

`check:tool-contracts` renders both in memory and exits non-zero with a focused message if either committed artifact differs.

Root `npm run build` runs `check:tool-contracts` before workspace compilation. The check uses only Node built-ins and therefore does not depend on TypeScript, Zod, or Godot.

## Failure semantics

Examples:

```text
Duplicate contract name
  -> generator exits non-zero

Unknown profile/domain
  -> generator exits non-zero

Generated TypeScript/Markdown stale
  -> npm run check:tool-contracts exits non-zero
  -> npm run build fails before TypeScript compile

Registrar declares unknown tool
  -> createMcpServer throws Uncataloged MCP tool

Registrar description differs from canonical manifest
  -> createMcpServer throws MCP tool description drift: <name>
```

No automatic rewrite occurs during `build`; builds must never mutate the working tree.

## Testing

Phase 7 requires:

- generator unit/smoke coverage using temporary output paths or pure render functions;
- `--check` against committed artifacts;
- catalog tests preserving all Phase 6 profile counts and representative membership;
- registry tests for unknown tools and description mismatch;
- MCP server tests proving `full` still lists 165 tools and minimal remains five;
- standard integration remaining 15/15 with the real Godot 4.6.3 handshake/profile slice;
- runtime 10/10 and visual 2/2 as regression gates.

## Acceptance criteria

Phase 7 is complete only when:

1. exactly 165 canonical contracts exist;
2. generated runtime catalog and Markdown inventory are byte-deterministic;
3. `check:tool-contracts` detects a stale generated artifact without rewriting it;
4. normal build invokes the check;
5. profile counts remain `minimal=5`, `core=78`, `2d=121`, `3d=107`, `navigation=67`, `ui=81`, `runtime=30`, `full=165`;
6. runtime discovery uses canonical descriptions;
7. registration rejects unknown names and description drift;
8. no public MCP tool is added/removed/renamed;
9. no GDScript or specialized handler is generated;
10. all authoritative Windows + Godot 4.6.3 gates are green.
