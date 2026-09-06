# Godot MCP Contract & Codegen Foundation Design

## Goal

Make public MCP tool contracts mechanically consistent as the project scales past 165 tools by introducing one canonical static contract source and deterministic generated artifacts, while keeping schemas, handlers, RPC behavior, and GDScript explicit.

## Scope

Phase 7 adds one canonical entry per public MCP tool with:

- `name`;
- `domain`;
- `profiles`;
- `description`;
- static risk-policy metadata;
- registration binding metadata.

The generator produces committed TypeScript catalog/policy metadata and a Markdown inventory. It also validates a pilot set of concrete schema/handler bindings.

Phase 7 does **not** generate GDScript, Zod schemas, handler functions, RPC implementations, Undo/Redo logic, capability semantics, or dynamic security decisions. It adds no public MCP tool and changes no profile membership.

## Canonical contract

`scripts/tool-contracts.json` is the canonical static source. Every one of the 165 tools has this shape:

```json
{
  "name": "navigation.mesh.bake",
  "domain": "navigation",
  "profiles": ["2d", "3d", "navigation", "full"],
  "description": "Copy-on-write parse and synchronously bake navigation geometry from an explicit scene source root.",
  "risk": {
    "baseline": "normal",
    "tags": ["normal_mutation"],
    "dynamic": "none"
  },
  "binding": {
    "status": "canonical",
    "source": "packages/server/src/mcp/register-navigation-tools.ts",
    "schemaRef": "NavigationMeshBakeSchema",
    "handlerRef": "bakeNavigationMesh"
  }
}
```

### Risk metadata

`risk.baseline` is `normal` or `risky` before argument-dependent overrides. `risk.tags` may contain `read`, `control`, and `normal_mutation`; these generate the static policy sets currently hand-maintained in `tool-policy.ts`. `risk.dynamic` is documentation/check metadata: `none`, `conditional`, or `blockable`. Dynamic logic stays hand-authored in `ToolPolicy`.

This preserves behavior while removing drift between the tool contract and the static READS/CONTROLS/NORMAL_MUTATIONS lists.

### Binding metadata

Every tool records its registration source. Phase 7 proves concrete schema/handler bindings incrementally for three representative families:

1. `godot.tools` (local/read-only tooling);
2. all `navigation.*` tools (specialized RPC/capability-aware family);
3. the Node3D/Mesh3D/Camera3D/Collision3D/Light3D power tools (standard RPC family).

Those entries use `binding.status = "canonical"` and must provide `schemaRef` and `handlerRef`. The generator verifies that the referenced registration source exists and contains those symbols/tokens. Remaining tools use `binding.status = "legacy"` with a concrete source path and migrate later without blocking Phase 7.

## Generated artifacts

The dependency-free generator `scripts/generate-tool-contracts.mjs` deterministically produces:

- `packages/server/src/tooling/tool-catalog.generated.ts`;
- `packages/server/src/security/tool-policy.generated.ts`;
- `docs/generated/tool-inventory.md`.

Generated files are committed and never hand-edited.

`npm run generate:tool-contracts` writes them. `npm run check:tool-contracts` performs validation and byte comparison without writing. Root `npm run build` starts with `check:tool-contracts`.

## Runtime integration

`ToolRegistry` consumes the generated catalog. Registrar descriptions are optional for migration compatibility, but if supplied they must exactly match the canonical description; the forwarded registration always receives the canonical description.

`ToolPolicy` imports generated static name lists instead of owning duplicate READS/CONTROLS/NORMAL_MUTATIONS literals. Argument-dependent risk escalation and blocking remain explicit in `tool-policy.ts`.

Pilot registrars remove duplicated descriptions so the canonical source is observable in production, while keeping existing `inputSchema` objects and handlers unchanged.

## Determinism and compatibility

The generator sorts tools by name and orders profiles/tags by fixed enums. Same canonical JSON must produce byte-identical outputs on Windows and Linux.

Phase 6 behavior is invariant:

- public tools: 165;
- profile counts: minimal 5, core 78, 2d 121, 3d 107, navigation 67, ui 81, runtime 30, full 165;
- tool names, schemas, handlers, descriptions, risk behavior, and profile exposure remain externally unchanged.

## Failure behavior

Generation/check fails on:

- duplicate or missing tool names;
- unknown domains/profiles/risk values/tags;
- missing `full` profile membership;
- count not equal to 165;
- missing registration source;
- canonical binding without schema/handler reference;
- canonical binding whose source does not contain the declared reference tokens;
- stale generated output.

Runtime server construction still fails on uncataloged or undeclared tools, and additionally rejects a registrar description that drifts from canonical metadata.

## Acceptance criteria

1. Exactly 165 canonical contracts exist and Phase 6 names/counts are unchanged.
2. Every contract has risk metadata and a concrete registration source.
3. Static risk sets are generated and exactly reproduce the Phase 6 READS/CONTROLS/NORMAL_MUTATIONS memberships.
4. `godot.tools`, all Navigation tools, and the selected 3D power family have verified concrete schema/handler bindings.
5. Pilot registrars no longer duplicate canonical descriptions.
6. Generator output is deterministic and `--check` is non-mutating.
7. Root build rejects stale generated artifacts.
8. No GDScript, Zod schema, handler, RPC implementation, or dynamic risk decision is generated.
9. Existing MCP behavior/profile exposure remains unchanged.
10. Final Windows + Godot 4.6.3 gates are green before Phase 7 is closed.
