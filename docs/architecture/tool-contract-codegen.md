# Tool contracts and generated artifacts

Phase 7 introduces a code-generation boundary for **static public MCP tool contracts**. It deliberately does not generate execution logic.

## Source of truth

Edit only `scripts/tool-contracts.json` for static contract metadata. Every public tool has exactly one entry with:

- `name`, `domain`, `profiles`, `description`;
- `risk.baseline`, `risk.tags`, `risk.dynamic`;
- `binding.status` and a concrete registration `source`;
- `schemaRef` and `handlerRef` for bindings already migrated to canonical verification.

The manifest contains exactly 165 tools, matching the Phase 6 full surface.

## Generated artifacts

`npm run generate:tool-contracts` writes:

```text
packages/server/src/tooling/tool-catalog.generated.ts
packages/server/src/security/tool-policy.generated.ts
docs/generated/tool-inventory.md
```

The catalog powers profiles and `godot.tools`. The policy artifact provides the static read/control/normal-mutation name sets consumed by `ToolPolicy`. The inventory is a deterministic human-readable view of profiles, risk metadata, binding migration status, source, and description.

All three outputs are committed and must not be edited directly.

## Risk boundary

The generator owns only static classification metadata. `ToolPolicy` still owns argument-dependent behavior such as overwrite elevation, permission enablement, approval fingerprints, reflective-method blocking, filesystem fingerprints, and transaction barriers.

The generated static memberships intentionally reproduce the exact Phase 6 sets:

```text
READS             67
CONTROLS           9
NORMAL_MUTATIONS  86
```

Changing those memberships is therefore a reviewed contract change rather than an incidental edit in policy code.

## Binding migration

Every entry records the TypeScript source that declares the tool. Phase 7 verifies concrete schema/handler references for 21 representative tools:

- `godot.tools`;
- 10 `navigation.*` tools;
- 10 Node3D/Mesh3D/Camera3D/Collision3D/Light3D tools.

These use `binding.status = canonical`. The generator requires the source file and declared `schemaRef`/`handlerRef` tokens to exist. Remaining entries are `legacy` and retain only the concrete registration source until migrated incrementally.

Pilot registrars keep their actual Zod schemas and handlers hand-authored but omit duplicated descriptions; `ToolRegistry` injects the canonical description. A legacy registrar may still supply a description, but a mismatch fails server construction.

## Drift gate

`npm run check:tool-contracts` validates the manifest/bindings, renders all expected artifacts in memory, and byte-compares them with the committed files. Check mode never writes.

Root `npm run build` begins with this check, so stale catalog, static-policy metadata, or inventory fails before TypeScript compilation.

## What codegen does not own

Phase 7 does **not** generate:

```text
GDScript handlers
TypeScript handler functions
Zod schemas
RPC methods
argument-dependent risk/permission decisions
capability probes
Undo/Redo logic
```

Those remain explicit specialized code.

## Contributor workflow

1. Update the canonical contract in `scripts/tool-contracts.json`.
2. Keep schema/handler implementation in the normal registrar/tool files.
3. For a migrated binding, record exact `source`, `schemaRef`, and `handlerRef`.
4. Run `npm run generate:tool-contracts`.
5. Review all generated diffs.
6. Run `npm run check:tool-contracts` and normal build/tests.

Runtime still fails fast on uncataloged declarations, missing declarations, or registrar description drift.
