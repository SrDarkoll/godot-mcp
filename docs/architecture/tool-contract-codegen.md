# Tool contracts and generated artifacts

Phase 7 introduces a code-generation boundary for **static public MCP tool metadata**. It does not generate tool execution logic.

## Source of truth

Edit only:

```text
scripts/tool-contracts.json
```

Each public tool has exactly one entry containing:

- `name`
- `domain`
- `profiles`
- `description`

The manifest currently contains exactly 165 tools, matching the Phase 6 full surface.

## Generated artifacts

Run:

```text
npm run generate:tool-contracts
```

This writes:

```text
packages/server/src/tooling/tool-catalog.generated.ts
docs/generated/tool-inventory.md
```

Both files are committed so changes remain reviewable. Do not edit them directly.

`tool-catalog.generated.ts` is the runtime catalog consumed by profiles and `godot.tools`. `tool-inventory.md` is a deterministic inventory, not a replacement for curated domain documentation.

## Drift gate

Run:

```text
npm run check:tool-contracts
```

The command renders the expected artifacts in memory and compares them with the committed files. It never rewrites files in check mode.

The root `npm run build` executes this check before TypeScript compilation. A stale catalog or inventory therefore fails the normal build gate with a focused message.

## Registration behavior

Existing specialized registrar files continue to own:

- Zod input schemas;
- handler functions;
- RPC forwarding;
- recovery/Undo/Redo behavior;
- security semantics.

`ToolRegistry` validates each declared name against the generated catalog. If a registrar still includes a description, it must match the canonical contract exactly. The registry forwards the canonical description to MCP and uses it for `godot.tools` discovery.

This permits incremental cleanup of old duplicated descriptions without requiring a big-bang rewrite of 165 handlers.

## What codegen does not own

Phase 7 intentionally does **not** generate:

```text
GDScript handlers
TypeScript handlers
Zod schemas
RPC methods
risk/permission decisions
capability probes
Undo/Redo logic
```

Those remain explicit specialized code because their semantics are not mechanical metadata.

## Contributor workflow

When adding or changing static tool metadata:

1. update `scripts/tool-contracts.json`;
2. run `npm run generate:tool-contracts`;
3. review both generated diffs;
4. run `npm run check:tool-contracts`;
5. run the normal build/test gates.

If a registrar description and contract description diverge, server construction fails with:

```text
MCP tool description drift: <tool-name>
```

If a registrar declares a name absent from the contract source, construction fails with:

```text
Uncataloged MCP tool: <tool-name>
```
