# Godot MCP Compatibility & Capability Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable feature-first Godot 4.x compatibility core, expose one bounded capability manifest tool, and migrate Navigation plus Visual to it without changing their successful 4.6.3 behavior.

**Architecture:** A single GDScript `CompatibilityCore` owns structured engine version metadata, feature probes, and known quirks. The addon sends its bounded manifest during hello; BridgeServer retains it for `godot.capabilities`. Navigation and Visual receive the same core instance from `rpc_dispatcher.gd`.

**Tech Stack:** Godot 4.x GDScript, TypeScript, Zod v4, MCP SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-godot-mcp-compatibility-capability-core-design.md`

## Global Constraints

- Base exactly on Phase 4 v3 tree `2a1da485f0a442829dda151a3f26a86b67859bc0`.
- Windows Godot 4.6.3 remains the authoritative runtime/editor gate.
- Feature probing takes precedence over version assumptions.
- No arbitrary reflection tools or raw ClassDB/RID exposure.
- Add at most one public MCP tool: `godot.capabilities`.
- Do not refactor unrelated handlers or start Physics.
- Keep old hello payloads schema-valid by making the compatibility manifest optional in protocol.

---

### Task 1: Protocol manifest contracts

**Files:**
- Create: `packages/protocol/src/compatibility.ts`
- Modify: `packages/protocol/src/capabilities.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/compatibility.test.ts`

**Interfaces:**
- Produces `EngineVersionInfo`, `CapabilityEntry`, `CompatibilityQuirk`, and `CompatibilityManifest` schemas/types.
- Extends `AddonHello.compatibility?: CompatibilityManifest`.

- [ ] Write failing protocol tests for all three capability states, version metadata, quirk metadata, and optional hello compatibility.
- [ ] Run the protocol test and confirm failure before implementation.
- [ ] Implement strict bounded schemas and export them.
- [ ] Run protocol tests and typecheck.
- [ ] Commit `feat(compatibility): add capability manifest contracts`.

### Task 2: Godot feature probe and compatibility core

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/compatibility/feature_probe.gd`
- Create: `packages/godot-addon/addons/godot_mcp/bridge/compatibility/quirk_registry.gd`
- Create: `packages/godot-addon/addons/godot_mcp/bridge/compatibility/compatibility_core.gd`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`
- Test: `packages/server/test/compatibility-addon-contract.test.ts`

**Interfaces:**
- `CompatibilityCore.new(editor_interface)`
- `manifest() -> Dictionary`
- `status(capability_id: String) -> String`
- `supports(capability_id: String) -> bool`
- `quirk_active(quirk_id: String) -> bool`

- [ ] Write source-contract tests requiring `ClassDB.class_exists`, `ClassDB.class_has_method`, `ClassDB.class_get_property_list`, safe class instantiation/property-storage probing, editor method probing, headless probing, and one shared core instance in dispatcher.
- [ ] Run the contract test and confirm it fails.
- [ ] Implement `FeatureProbe`, `QuirkRegistry`, and `CompatibilityCore` with the fixed capability IDs from the spec.
- [ ] Wire one core instance into the dispatcher.
- [ ] Run source-contract tests / Godot syntax gate when available.
- [ ] Commit `feat(compatibility): add Godot capability core`.

### Task 3: Handshake transport and MCP introspection

**Files:**
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/bridge_client.gd`
- Modify: `packages/server/src/bridge/bridge-server.ts`
- Modify: `packages/server/src/mcp/register-core-tools.ts`
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/src/security/tool-policy.ts`
- Test: `packages/server/test/bridge-server.test.ts`
- Test: `packages/server/test/mcp-server.test.ts`
- Test: `packages/server/test/tool-policy.test.ts`

**Interfaces:**
- `BridgeServer.compatibility` returns authenticated manifest or `null`.
- Public read-only tool `godot.capabilities` returns the manifest.

- [ ] Write failing tests for authenticated manifest lifetime, no-manifest error, tool registration, and read-only policy.
- [ ] Run tests and confirm the intended failures.
- [ ] Add manifest to addon hello and server metadata getter.
- [ ] Register `godot.capabilities` as the sole new public tool.
- [ ] Run server tests/typecheck.
- [ ] Commit `feat(compatibility): expose authenticated capability manifest`.

### Task 4: Migrate Navigation semantics

**Files:**
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/handlers/navigation_handlers.gd`
- Modify: `packages/server/test/navigation-addon-contract.test.ts`
- Modify: `tests/integration/navigation-power-tools.test.ts`

**Interfaces:**
- Navigation handler constructor accepts the shared compatibility core.
- Missing `navigation.agent3d.keep_y_velocity` capability yields `UNSUPPORTED_CAPABILITY` for writes.

- [ ] Change contract/E2E expectations first so Navigation must consult the shared core and keep the existing 4.6 behavior.
- [ ] Confirm the contract test fails against the old handler.
- [ ] Replace local compatibility assumptions with core status/quirk queries.
- [ ] Run Navigation contract and integration test when available.
- [ ] Commit `refactor(navigation): use compatibility core`.

### Task 5: Migrate Visual admission

**Files:**
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/handlers/visual_handlers.gd`
- Modify: `packages/server/test/visual-tools.test.ts` or add an addon contract test for Visual.
- Modify: `tests/integration/visual-capture-headless.test.ts`

**Interfaces:**
- Visual handler constructor accepts the shared core.
- `_capture` checks the effective `visual.viewport*.capture` capability before per-call viewport validation.

- [ ] Write a failing source/E2E assertion that visual admission uses compatibility IDs instead of local headless/method checks.
- [ ] Confirm failure.
- [ ] Replace duplicated admission with the core while retaining dynamic viewport checks.
- [ ] Run visual tests when available.
- [ ] Commit `refactor(visual): use compatibility capabilities`.

### Task 6: Live manifest vertical slice and docs

**Files:**
- Modify: `tests/integration/editor-handshake.test.ts`
- Create: `docs/architecture/compatibility-capabilities.md`
- Modify: `docs/protocol/foundation-rpc.md`
- Modify: `README.md` only if its tool inventory is explicit.

**Interfaces:**
- Live `godot.capabilities` result reports engine 4.6.3 and expected Navigation/Visual entries.

- [ ] Extend the integration handshake test to call `godot.capabilities` against live Godot.
- [ ] Assert engine major/minor/patch and key capability states without hard-coding the engine hash.
- [ ] Document feature-first behavior, conservative unknown-version behavior, and the bounded public manifest.
- [ ] Run static checks / available test syntax checks.
- [ ] Commit `test(compatibility): verify live capability manifest`.

### Task 7: Verification and transport

**Files:** no production changes expected.

- [ ] Run `git diff --check` and inspect every Phase 5 commit.
- [ ] Run `npm run build`, `npm run typecheck`, and focused/full tests if dependencies are available; otherwise report the sandbox limitation without claiming green.
- [ ] Generate an incremental Phase 5 patch from `7b0172bdb7a2d80c8df863f6ad6d0a0898ea1d64`.
- [ ] Generate a complete Phase 5 bundle.
- [ ] Clone the exact Phase 4 v3 bundle, apply the Phase 5 patch with `git am --keep-cr`, compare source and simulated tree hashes, and require a clean simulation.
- [ ] Hand off Windows PowerShell gate commands. Do not close Phase 5 until fresh Windows Godot 4.6.3 evidence is green.
