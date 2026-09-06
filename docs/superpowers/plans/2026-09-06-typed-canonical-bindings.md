# Typed Canonical Bindings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 21 Phase 7 pilot bindings type-safe end-to-end and derive risk baseline from static tags without changing public behavior.

**Architecture:** Add a small `canonical-tool-binding.ts` helper that owns a canonical tool's real name/schema/handler references and marks its registration. Extend the generated internal catalog with binding status so `ToolRegistry` can reject direct registration of canonical names. Strengthen the existing generator with a constrained exact-binding parser and derive risk baseline from tags instead of accepting it from JSON.

**Tech Stack:** TypeScript 7, Zod v4, MCP server API, Node.js generator scripts, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-typed-canonical-bindings-design.md`

## Global Constraints

- Base tree is Phase 7 v2: `1ea8b6e46ad2df6457023407e45709019939f725`.
- Exactly 165 public tools remain exposed by `full`.
- Only the existing 21 canonical pilots migrate to the typed binder; 144 tools remain legacy.
- No GDScript files may change.
- No public MCP names, descriptions, profiles, schemas, handlers, or risk outcomes may change.
- Dynamic/argument-dependent risk logic remains handwritten.

---

### Task 1: Typed canonical binder and runtime enforcement

**Files:**
- Create: `packages/server/src/tooling/canonical-tool-binding.ts`
- Modify: `packages/server/src/tooling/tool-registry.ts`
- Modify: `packages/server/src/tooling/tool-catalog.generated.ts` via generator later
- Test: `packages/server/test/tool-registrar.test.ts`

**Interfaces:**
- Produces: `defineCanonicalToolBinding(name, { inputSchema, handler })`
- Produces: `bindCanonicalTool(registrar, binding, context, options?)`
- Produces: an internal registration marker consumed only by `ToolRegistry`.

- [ ] Write a failing registrar test showing direct registration of `godot.tools` is rejected.
- [ ] Write a failing binder test showing the same canonical tool registers when passed through `bindCanonicalTool`.
- [ ] Implement the minimal binding object, marker, binder, and registry enforcement.
- [ ] Run the focused tests or a direct TypeScript/static reproduction when dependencies are unavailable.
- [ ] Commit `feat(contracts): enforce typed canonical registration`.

### Task 2: Migrate all 21 pilot registrations

**Files:**
- Modify: `packages/server/src/mcp/register-tooling-tools.ts`
- Modify: `packages/server/src/mcp/register-navigation-tools.ts`
- Modify: `packages/server/src/mcp/register-power3d-tools.ts`
- Test: `packages/server/test/tool-contract-generator.test.ts`

**Interfaces:**
- Consumes: `defineCanonicalToolBinding`, `bindCanonicalTool`.
- Produces: exactly 21 canonical binding definitions whose schemas and handlers are actual TS references.

- [ ] Replace the pilot contract test with a failing expectation for binding definitions and zero direct `registerTool` calls.
- [ ] Migrate `godot.tools` using a named `discoverGodotTools` context-first handler.
- [ ] Migrate Navigation while preserving `omitUndefinedValues` on configure operations.
- [ ] Migrate power3d while preserving its local `node` schema and configure transforms.
- [ ] Verify names/schema/handler references remain exact.
- [ ] Commit `refactor(contracts): bind canonical pilot tools`.

### Task 3: Exact pairing verification and derived risk baseline

**Files:**
- Modify: `scripts/generate-tool-contracts.mjs`
- Modify: `scripts/tool-contracts.json`
- Modify generated artifacts.
- Test: `packages/server/test/tool-contract-generator.test.ts`

**Interfaces:**
- Generator derives `baseline` from `risk.tags`.
- Generator validates the exact `defineCanonicalToolBinding(tool, { inputSchema, handler })` object for canonical contracts.
- Generated catalog carries internal `bindingStatus` only.

- [ ] Add failing generator tests for contradictory/manual baseline and for wrong schema/handler pairing with expected tokens elsewhere.
- [ ] Remove all 165 manual `risk.baseline` fields from the manifest.
- [ ] Derive baseline from tag presence and update inventory rendering.
- [ ] Replace textual canonical token checks with exact binding-call extraction/comparison.
- [ ] Generate `bindingStatus` into the internal catalog.
- [ ] Regenerate all artifacts and verify profile/risk sets are unchanged.
- [ ] Commit `refactor(contracts): derive risk and verify exact bindings`.

### Task 4: Documentation and final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-09-06-typed-canonical-bindings-design.md` only if implementation reality requires wording alignment.
- Generated inventory is updated by Task 3.

**Interfaces:** None beyond the accepted Phase 7.1 contract.

- [ ] Run `node scripts/generate-tool-contracts.mjs --check`.
- [ ] Compare all 165 tool names and all eight profile counts to Phase 7 v2.
- [ ] Compare generated READ/CONTROL/NORMAL_MUTATION sets to Phase 7 v2.
- [ ] Confirm exactly 21 canonical and 144 legacy contracts.
- [ ] Confirm `git diff --check` and zero `.gd` changes.
- [ ] Run available TypeScript syntax/smoke verification; do not claim unavailable npm/Godot gates.
- [ ] Commit `docs: close typed canonical binding foundation` if documentation changed after implementation.
