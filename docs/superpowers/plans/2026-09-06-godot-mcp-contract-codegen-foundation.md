# Godot MCP Contract & Codegen Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one canonical static tool-contract source and deterministic generated catalog/documentation while preserving all Phase 6 public behavior.

**Architecture:** `scripts/tool-contracts.json` becomes the sole source for tool name/domain/profile/description metadata. A dependency-free Node generator validates the manifest and produces a committed TypeScript catalog plus Markdown inventory; `ToolRegistry` consumes the generated catalog and validates runtime registrar declarations against it.

**Tech Stack:** Node.js 22 built-ins, TypeScript, Zod v4, MCP SDK, Vitest, existing integration harness.

**Spec:** `docs/superpowers/specs/2026-09-06-godot-mcp-contract-codegen-foundation-design.md`

## Global Constraints

- Base exactly on Phase 6 tree `2f4bf5b019cd2705787f3c0dcd3209945f22148e`.
- Preserve exactly 165 public tools; add no new MCP tool in Phase 7.
- Preserve profile counts `5/78/121/107/67/81/30/165`.
- Do not generate GDScript, handlers, Zod schemas, RPC implementations, or risk logic.
- Generated files are committed and must never be edited by hand.
- `npm run build` must check generated artifacts without mutating the tree.
- Windows Godot 4.6.3 remains the authoritative final gate.

---

### Task 1: Canonical contract manifest and generator

**Files:**
- Create: `scripts/tool-contracts.json`
- Create: `scripts/generate-tool-contracts.mjs`
- Test: `packages/server/test/tool-contract-generator.test.ts`

**Interfaces:**
- Manifest entry: `{name, domain, profiles, description}`.
- Generator supports normal write mode and `--check`.
- Generated outputs are `packages/server/src/tooling/tool-catalog.generated.ts` and `docs/generated/tool-inventory.md`.

- [ ] Write a failing generator test that requires unique names, known domains/profiles, deterministic sorting, full-profile membership, and check-mode drift detection.
- [ ] Verify RED because generator/manifest do not exist.
- [ ] Build the 165-entry canonical manifest from the existing Phase 6 catalog and registration descriptions.
- [ ] Implement dependency-free validation/render/write/check logic.
- [ ] Run the generator and focused checks.
- [ ] Commit `feat(contracts): add canonical tool contract generator`.

### Task 2: Replace the hand-authored catalog with generated output

**Files:**
- Create: `packages/server/src/tooling/tool-catalog.generated.ts`
- Modify: `packages/server/src/tooling/tool-catalog.ts`
- Modify: `packages/server/test/tool-catalog.test.ts`
- Create: `docs/generated/tool-inventory.md`

**Interfaces:**
- Existing imports from `tool-catalog.ts` remain valid.
- `StaticToolCatalogEntry` gains canonical `description`.
- Profile helper behavior remains byte-for-byte deterministic/alphabetical.

- [ ] Update catalog tests first to require canonical descriptions and exact Phase 6 counts.
- [ ] Verify RED against the old catalog type/source.
- [ ] Generate the TypeScript catalog and Markdown inventory.
- [ ] Reduce `tool-catalog.ts` to a re-export of generated symbols.
- [ ] Re-run generator/check/catalog tests.
- [ ] Commit `refactor(contracts): generate tool catalog and inventory`.

### Task 3: Make ToolRegistry enforce canonical descriptions

**Files:**
- Modify: `packages/server/src/tooling/tool-registry.ts`
- Modify: `packages/server/test/tool-registrar.test.ts`
- Modify: `packages/server/test/tooling-tools.test.ts`

**Interfaces:**
- Discovery reads `entry.description` directly.
- Unknown names still throw `Uncataloged MCP tool: <name>`.
- A supplied mismatched description throws `MCP tool description drift: <name>`.
- Forwarded active registration always uses the canonical description.

- [ ] Write failing tests for description mismatch and canonical discovery output.
- [ ] Verify RED with the Phase 6 runtime-captured description model.
- [ ] Implement minimal registry changes and keep profile filtering/observation unchanged.
- [ ] Re-run focused checks.
- [ ] Commit `refactor(contracts): enforce canonical tool metadata`.

### Task 4: Make generated-artifact checking a normal gate

**Files:**
- Modify: `package.json`
- Modify: `packages/server/test/tool-contract-generator.test.ts`
- Modify: `README.md`
- Create: `docs/architecture/tool-contract-codegen.md`

**Interfaces:**
- Root scripts: `generate:tool-contracts`, `check:tool-contracts`.
- Root `build` executes `check:tool-contracts` before workspace compilation.
- Check mode never writes files.

- [ ] Write/extend a failing test proving stale output makes check mode non-zero and leaves the stale file untouched.
- [ ] Add root scripts and build pre-check.
- [ ] Document canonical-vs-generated-vs-hand-authored boundaries and contributor workflow.
- [ ] Re-run `node scripts/generate-tool-contracts.mjs --check` and static checks.
- [ ] Commit `build(contracts): gate generated tool artifacts`.

### Task 5: Regression coverage and transport

**Files:**
- Modify only tests/docs if a genuine uncovered contract is found.

**Interfaces:**
- Full MCP surface remains 165; minimal remains five.
- No GDScript files change.

- [ ] Compare generated contract names exactly with the Phase 6 catalog names.
- [ ] Run generator twice and compare output hashes for determinism.
- [ ] Run `git diff --check`, `git status --short`, and `git show --check` on every Phase 7 commit.
- [ ] Run TypeScript syntax/transpile checks available in the sandbox.
- [ ] Run full npm/Godot gates locally only if dependencies/binary are actually available; otherwise report the exact unavailable gate.
- [ ] Generate incremental patch from Phase 6 HEAD `070bf90119970b38f612c92de9be50601995ad11` and a complete Phase 7 bundle.
- [ ] Clone the exact Phase 6 bundle, apply patch with `git am --keep-cr`, compare source/simulation trees, and require clean status.
- [ ] Hand off exact Windows PowerShell gates; do not close Phase 7 until fresh Windows evidence is green.
