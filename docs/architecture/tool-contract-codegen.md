# Tool contracts and generated artifacts

Phase 7 introduced a code-generation boundary for **static public MCP tool contracts**. Phase 7.1 strengthens the canonical pilot bindings so their real TypeScript schema and handler references are paired and registered from one typed binding definition. Execution logic is still not generated.

## Source of truth

`scripts/tool-contracts.json` uses manifest `schemaVersion: 2`. Every one of the 173 public tools has exactly one entry with:

- `name`, `domain`, `profiles`, `description`;
- `risk.tags` and `risk.dynamic`;
- `binding.status` and a concrete registration `source`;
- `schemaRef` and `handlerRef` for bindings migrated to canonical verification.

`risk.baseline` is not authored in the manifest. It is derived by the generator: tools with at least one static risk tag are `normal`; tools with no static risk tags are `risky`. This reproduces the Phase 7 v2 classifications exactly while removing a duplicate truth.

## Generated artifacts

`npm run generate:tool-contracts` writes:

```text
packages/server/src/tooling/tool-catalog.generated.ts
packages/server/src/security/tool-policy.generated.ts
docs/generated/tool-inventory.md
```

The catalog powers profiles, `godot.tools`, and the internal canonical/legacy registration gate. The policy artifact provides the static read/control/normal-mutation name sets consumed by `ToolPolicy`. The inventory is a deterministic human-readable view of profiles, derived risk metadata, binding migration status, source, and description.

All three outputs are committed and must not be edited directly.

## Risk boundary

The generator owns only static classification metadata. `ToolPolicy` still owns argument-dependent behavior such as overwrite elevation, permission enablement, approval fingerprints, reflective-method blocking, filesystem fingerprints, and transaction barriers.

The generated static memberships intentionally reproduce the exact Phase 6/7 sets:

```text
READS             69
CONTROLS          10
NORMAL_MUTATIONS  86
```

`risk.dynamic` remains explicit contract metadata (`none`, `conditional`, or `blockable`); it does not generate dynamic policy logic.

## Typed canonical binding migration

There are 29 canonical typed bindings:

- `godot.tools`;
- 10 `navigation.*` tools;
- 10 Node3D/Mesh3D/Camera3D/Collision3D/Light3D tools;
- 8 `headless.*` tools introduced by Phase 8.

Each pilot source defines the actual binding with real TypeScript references:

```ts
const navigationMeshBakeTool = defineCanonicalToolBinding('navigation.mesh.bake', {
  inputSchema: NavigationMeshBakeSchema,
  handler: bakeNavigationMesh
});
```

The generator locates that exact definition and compares its identifier-valued `inputSchema` and `handler` fields with the manifest `schemaRef` and `handlerRef`. Merely mentioning the expected tokens elsewhere in the file is insufficient.

Registration then consumes that same object:

```ts
bindCanonicalTool(registrar, navigationMeshBakeTool, rpc);
```

The tool name, schema object, and handler reference therefore travel together. `ToolRegistry` rejects a canonical tool that reaches `registerTool` without the private binder marker, and removes that marker before forwarding the public MCP config. Existing `assertFullyObserved()` still detects a canonical definition that was never registered.

The remaining 144 entries are `legacy`; they retain their normal registration path and concrete source until migrated incrementally.

## Drift gate

`npm run check:tool-contracts` validates manifest metadata, exact canonical bindings, source locations, and generated artifacts without writing. It byte-compares the rendered outputs with the committed files.

Root `npm run build` begins with this check, so stale catalog, static-policy metadata, inventory, malformed risk metadata, or a canonical schema/handler mismatch fails before normal TypeScript compilation.

## What codegen does not own

Phase 7.1 still does **not** generate:

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

1. Update static metadata in `scripts/tool-contracts.json`.
2. Keep schema and handler implementations as normal TypeScript references.
3. For a canonical tool, define exactly one `defineCanonicalToolBinding(name, { inputSchema, handler })` in the declared source and register that object with `bindCanonicalTool`.
4. Keep the manifest `schemaRef`/`handlerRef` aligned with those exact identifiers.
5. Run `npm run generate:tool-contracts`.
6. Review all generated diffs.
7. Run `npm run check:tool-contracts` and normal build/tests.

Runtime fails fast on uncataloged declarations, missing declarations, registrar description drift, or a canonical tool that bypasses the typed binder.
