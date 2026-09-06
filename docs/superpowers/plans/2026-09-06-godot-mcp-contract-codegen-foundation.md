# Godot MCP Contract & Codegen Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one canonical 165-tool contract source that generates catalog/static-risk/docs metadata and validates concrete bindings for representative families without generating execution logic.

**Architecture:** `scripts/tool-contracts.json` owns static metadata. `scripts/generate-tool-contracts.mjs` validates it and emits catalog, static policy sets, and inventory. Existing registrars keep schemas/handlers explicit; pilot families reference canonical descriptions and are checked against binding metadata.

**Tech Stack:** Node.js 22 built-ins, TypeScript, Zod v4, MCP SDK, Vitest, existing integration harness.

**Spec:** `docs/superpowers/specs/2026-09-06-godot-mcp-contract-codegen-foundation-design.md`

## Global Constraints

- Base exactly on Phase 6 tree `2f4bf5b019cd2705787f3c0dcd3209945f22148e`.
- Preserve exactly 165 public tools and profile counts `5/78/121/107/67/81/30/165`.
- Generate no GDScript, schemas, handlers, RPC implementations, or dynamic security decisions.
- Generated files are committed and build check mode never mutates them.
- Windows Godot 4.6.3 remains the authoritative final gate.

---

### Task 1: Expand canonical contracts with risk and binding metadata

**Files:**
- Modify: `scripts/tool-contracts.json`
- Modify: `scripts/generate-tool-contracts.mjs`
- Modify: `packages/server/test/tool-contract-generator.test.ts`

**Interfaces:**
- `risk = {baseline, tags, dynamic}` with bounded enums.
- `binding = {status, source, schemaRef?, handlerRef?}`.
- canonical bindings require source/schema/handler tokens to exist.

- [ ] Add failing generator tests for missing/invalid risk and canonical binding fields.
- [ ] Verify RED against the current four-field manifest.
- [ ] Populate risk metadata from the exact Phase 6 policy sets and dynamic exceptions.
- [ ] Populate concrete registration source for all tools and canonical bindings for tooling/navigation/3D pilots.
- [ ] Implement validation and source-reference checks.
- [ ] Run generator validation and commit.

### Task 2: Generate static risk-policy metadata

**Files:**
- Create: `packages/server/src/security/tool-policy.generated.ts`
- Modify: `packages/server/src/security/tool-policy.ts`
- Modify: `packages/server/test/tool-policy.test.ts` or existing policy coverage.

**Interfaces:**
- Generated exports: `READ_TOOL_NAMES`, `CONTROL_TOOL_NAMES`, `NORMAL_MUTATION_TOOL_NAMES`.
- Membership must equal Phase 6: 67 reads, 9 controls, 86 normal mutations.

- [ ] Add failing tests requiring exact generated memberships/counts.
- [ ] Verify RED because policy still owns literals.
- [ ] Render generated policy arrays from canonical risk tags.
- [ ] Replace hand-authored static sets with imports; leave dynamic overrides untouched.
- [ ] Verify exact behavior-focused policy tests and commit.

### Task 3: Canonicalize pilot registrar descriptions and bindings

**Files:**
- Modify: `packages/server/src/mcp/register-tooling-tools.ts`
- Modify: `packages/server/src/mcp/register-navigation-tools.ts`
- Modify: `packages/server/src/mcp/register-power3d-tools.ts`
- Modify: `packages/server/test/tool-registrar.test.ts`
- Modify: `packages/server/test/tool-contract-generator.test.ts`

**Interfaces:**
- Pilot registrations omit duplicated `description` values.
- ToolRegistry injects canonical description before guarded/base registration.
- Input schemas and handler bodies remain unchanged.

- [ ] Add failing tests proving canonical descriptions are injected when absent and mismatches still fail.
- [ ] Verify RED where needed.
- [ ] Remove description duplication only in pilot registrars.
- [ ] Validate all canonical binding references.
- [ ] Run focused checks and commit.

### Task 4: Extend generated inventory/build drift gate

**Files:**
- Modify: `docs/generated/tool-inventory.md`
- Modify: `docs/architecture/tool-contract-codegen.md`
- Modify: `README.md`
- Modify: `package.json` only if scripts require adjustment.

**Interfaces:**
- Inventory includes risk baseline/tags and binding status/source.
- `check:tool-contracts` compares all three generated artifacts without writing.

- [ ] Extend stale-output test to include generated policy metadata.
- [ ] Render enriched deterministic inventory.
- [ ] Update contributor docs with canonical-vs-generated-vs-hand-authored boundaries.
- [ ] Run generator twice and compare hashes; commit.

### Task 5: Regression and transport verification

**Files:**
- Tests/docs only if a real uncovered contract appears.

- [ ] Compare all 165 generated names/profile counts to Phase 6 invariants.
- [ ] Verify generated static risk memberships exactly match the captured Phase 6 sets.
- [ ] Verify canonical binding count is exactly 21 (`godot.tools` + 10 navigation + 10 power3d).
- [ ] Run `git diff --check` and `git show --check` for every Phase 7 commit.
- [ ] Run available build/tests in sandbox; report unavailable dependencies honestly.
- [ ] Generate incremental patch from Phase 6 HEAD `070bf90119970b38f612c92de9be50601995ad11` and complete bundle.
- [ ] Apply patch with `git am --keep-cr` to exact Phase 6 base and require equal source/simulated trees and clean status.
- [ ] Hand off full Windows PowerShell gates; do not close Phase 7 until fresh Windows evidence is green.
