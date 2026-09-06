# Typed Canonical Bindings Design

## Goal

Make `binding.status = "canonical"` an executable TypeScript invariant rather than textual metadata. A canonical tool must be defined once with its real input schema and real handler reference, registered through a dedicated binder, and rejected if code bypasses that binder. Remove `risk.baseline` as a manually maintained second truth by deriving it from static risk tags.

## Scope

Phase 7.1 applies only to the 21 existing canonical pilots:

- `godot.tools`
- all 10 `navigation.*` tools
- the 10 Node3D/Mesh3D/Camera3D/Collision3D/Light3D tools

The other 144 tools remain `legacy`. Public tool names, descriptions, schemas, profiles, risk outcomes, handlers, RPC calls, tool counts, and Godot behavior must remain unchanged. No GDScript changes are allowed.

## Typed binding model

Each pilot registration source defines a real TypeScript binding with actual references:

```ts
const navigationMeshBakeTool = defineCanonicalToolBinding('navigation.mesh.bake', {
  inputSchema: NavigationMeshBakeSchema,
  handler: bakeNavigationMesh
});
```

`bindCanonicalTool()` consumes that object. The registration call receives the name and schema from the binding object; the handler cannot be substituted at the registration site because it is also carried by that same object.

The binder accepts a context object separately because the canonical handlers are context-first (`rpc`, or `ToolRegistry` for `godot.tools`). An optional argument transform preserves the existing `omitUndefinedValues()` behavior without changing handler identity.

## Canonical bypass prevention

`bindCanonicalTool()` marks the internal registration with a private symbol. `ToolRegistry.registeringRegistrar()` knows which catalog entries are canonical and rejects a canonical tool registered without that marker. The marker is removed before forwarding the MCP tool config.

Therefore:

- direct `registrar.registerTool('navigation.mesh.bake', ...)` fails during server construction;
- a canonical binding object cannot register a different tool name;
- an unobserved canonical binding still fails the existing `assertFullyObserved()` gate.

## Exact source verification

For each canonical contract, `check:tool-contracts` locates the exact `defineCanonicalToolBinding('<tool name>', { ... })` call in the declared source file. Its small, constrained object must contain identifier-valued `inputSchema` and `handler` fields. The checker compares those identifiers to `binding.schemaRef` and `binding.handlerRef` from the manifest.

This specifically rejects the Phase 7 weakness where the expected schema and handler merely appeared elsewhere in the same file.

No general TypeScript AST/codegen layer is introduced.

## Risk baseline derivation

The manifest format is bumped to internal `schemaVersion: 2`. `risk.baseline` is removed from `scripts/tool-contracts.json`, and the generator derives it deterministically:

- one or more static risk tags -> `normal`
- no static risk tags -> `risky`

This exactly reproduces all 165 Phase 7 v2 classifications. `risk.dynamic` remains explicit metadata. Argument-dependent policy decisions remain handwritten in `ToolPolicy`.

## Generated artifacts

The generator continues to own:

- `tool-catalog.generated.ts`
- `tool-policy.generated.ts`
- `docs/generated/tool-inventory.md`

The internal catalog gains canonical/legacy binding status so the runtime registry can enforce binder usage. Discovery output remains unchanged and does not expose binding internals.

## Testing

Tests must prove:

1. generator derives baseline and rejects exact canonical schema/handler mismatch even when expected tokens appear elsewhere in the source;
2. canonical direct registration is rejected while binder registration succeeds and forwards canonical description;
3. pilot registration files use `defineCanonicalToolBinding` + `bindCanonicalTool` and no direct `registerTool` calls;
4. existing profile counts remain `5/78/121/107/67/81/30/165`;
5. generated artifacts are deterministic/current;
6. Windows build/typecheck/unit/Godot standard/runtime/visual gates remain authoritative.
