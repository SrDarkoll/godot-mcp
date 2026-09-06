# Godot MCP Tool Registry, Profiles & Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all public MCP tool metadata, make tool exposure profile-driven at startup, and add one bounded discovery tool without changing specialized handlers.

**Architecture:** A static `ToolCatalog` defines tool name/domain/profile membership. A profile-aware `ToolRegistrar` observes every existing registration declaration, rejects uncataloged names, and forwards only active tools to MCP. Project config/server CLI select one immutable profile; `godot.tools` reads the registry metadata and runtime descriptions.

**Tech Stack:** TypeScript, Zod v4, MCP SDK, Vitest, existing Node.js/Godot integration harness.

**Spec:** `docs/superpowers/specs/2026-09-06-godot-mcp-tool-registry-profiles-design.md`

## Global Constraints

- Base exactly on Phase 5 v3 tree `bacbe6ccde125d209a1507a32d744d6d258ae59c`.
- `full` must remain the default and preserve all 164 Phase 5 tools.
- Add exactly one new public MCP tool: `godot.tools`.
- Do not change existing tool schemas/handlers merely to support profiles.
- Profile selection is immutable after server construction.
- Profiles reduce exposure only; existing permissions/risk/recovery rules remain authoritative.
- Do not add dynamic scene-based profile switching or arbitrary reflection.
- Windows Godot 4.6.3 remains the authoritative final gate.

---

### Task 1: Protocol profile and discovery contracts

**Files:**
- Create: `packages/protocol/src/tooling.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/tooling.test.ts`

**Interfaces:**
- Produces `ToolProfileSchema`, `ToolDomainSchema`, `ToolDiscoveryParamsSchema`, `ToolCatalogEntrySchema`, `ToolDiscoveryResultSchema` and inferred types.
- Profile IDs: `minimal | core | 2d | 3d | navigation | ui | runtime | full`.
- Discovery `limit` defaults to 25 and is bounded to 50; `query` is max 80 characters.

- [ ] Write protocol tests asserting the exact eight profile IDs, domain enum, defaults/bounds, pagination fields and strict result shape.
- [ ] Run the focused protocol test and confirm RED because `tooling.ts` does not exist.
- [ ] Implement the minimal strict Zod schemas/types and export them.
- [ ] Re-run focused protocol checks/type syntax.
- [ ] Commit `feat(tooling): add profile and discovery contracts`.

### Task 2: Canonical tool catalog and profile-aware registrar

**Files:**
- Create: `packages/server/src/tooling/tool-catalog.ts`
- Create: `packages/server/src/tooling/tool-registry.ts`
- Modify: `packages/server/src/security/tool-registrar.ts`
- Test: `packages/server/test/tool-catalog.test.ts`
- Test: `packages/server/test/tool-registrar.test.ts`

**Interfaces:**
- `TOOL_CATALOG: readonly ToolCatalogEntry[]` contains every Phase 5 tool plus `godot.tools` exactly once.
- `ToolRegistry(profile)` exposes `registeringRegistrar(base)`, `activeNames()`, `entries(params)` and `summary()`.
- Registration of an unknown public tool throws `Uncataloged MCP tool: <name>` before forwarding.
- Every entry includes `full`.

- [ ] Write failing tests for catalog uniqueness, exact planned profile counts (`5/78/121/107/67/81/30/165`), representative inclusions/exclusions and uncataloged registration rejection.
- [ ] Verify RED before creating production catalog/registry code.
- [ ] Implement grouped catalog constants so every tool has one domain and explicit profile membership.
- [ ] Implement the profile-aware registrar wrapper that records descriptions for active and inactive declarations and forwards only active names.
- [ ] Re-run focused static/transpile/test checks.
- [ ] Commit `feat(tooling): centralize tool catalog and profiles`.

### Task 3: Make server registration profile-driven

**Files:**
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/test/mcp-server.test.ts`
- Test: `packages/server/test/tool-catalog.test.ts`

**Interfaces:**
- `McpServerContext.toolProfile?: ToolProfile`; omitted means `full`.
- `createMcpServer()` constructs one `ToolRegistry` and gives domain registration functions its profiled registrar.
- Full server construction must observe every catalog entry; tests compare the full `tools/list` against the catalog.

- [ ] Change MCP tests first: default/full expects 165 names including `godot.tools`; minimal expects exactly five foundation names; representative specialized profiles assert promised inclusion/exclusion.
- [ ] Verify tests are RED against the current unprofiled server.
- [ ] Wire `ToolRegistry` into `createMcpServer` while leaving existing domain registrar functions intact.
- [ ] Add full-construction assertion helper/test that every catalog entry was declared.
- [ ] Re-run focused server checks.
- [ ] Commit `refactor(tooling): make MCP registration profile-aware`.

### Task 4: Project config and startup profile resolution

**Files:**
- Modify: `packages/server/src/project/project-config.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/test/project-config.test.ts`
- Modify: `packages/server/test/server-lifecycle.test.ts` or add focused server-args tests where existing argument parsing is covered.
- Modify: `packages/cli/src/cli-args.ts`
- Modify: `packages/cli/src/cli-runner.ts`
- Modify: `packages/cli/test/cli.test.ts`
- Modify: `packages/cli/test/cli-runner-status.test.ts` or add a focused config/start test.

**Interfaces:**
- Project config gains `toolProfile`, default `full`.
- Server args gain `--tool-profile <ToolProfile>`.
- Resolution is CLI/server override > project config > `full`.
- CLI `config --tool-profile` persists; `start --tool-profile` passes a one-session override.

- [ ] Write failing config/server/CLI parsing tests before changing production code.
- [ ] Confirm invalid profiles and inapplicable CLI commands fail.
- [ ] Implement config schema/write support using shared `ToolProfileSchema`.
- [ ] Implement server parse/resolution and pass the resolved profile into `createMcpServer`.
- [ ] Implement CLI parsing/usage/config output/start forwarding.
- [ ] Re-run focused checks.
- [ ] Commit `feat(tooling): configure deterministic tool profiles`.

### Task 5: Bounded `godot.tools` discovery

**Files:**
- Create: `packages/server/src/mcp/register-tooling-tools.ts`
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/src/security/tool-policy.ts`
- Test: `packages/server/test/tooling-tools.test.ts`
- Modify: `packages/server/test/tool-policy.test.ts`

**Interfaces:**
- `registerToolingTools(registrar, registry)` registers only `godot.tools`.
- The tool works without editor connectivity.
- Result includes current/selected profile, profile counts, paginated tool entries, total/offset/limit/nextOffset.
- No schemas or handlers are exposed in results.

- [ ] Write failing behavior tests for default active-only discovery, explicit-profile inactive discovery, domain/query filtering, stable alphabetical pagination and no-editor operation.
- [ ] Write a failing policy test proving `godot.tools` is read-only/local.
- [ ] Implement discovery registration and registry query methods minimally.
- [ ] Add `godot.tools` to read/local policy classification.
- [ ] Re-run focused checks.
- [ ] Commit `feat(tooling): add bounded tool discovery`.

### Task 6: Integration slice and documentation

**Files:**
- Create: `tests/integration/tool-profiles.test.ts`
- Create: `docs/architecture/tool-registry-profiles.md`
- Modify: `README.md`
- Modify: `packages/cli/src/cli-args.ts` usage text if not already complete.

**Interfaces:**
- Integration starts an MCP server with `toolProfile: 'minimal'` or equivalent normal startup path and verifies `tools/list` plus `godot.tools` while a normal Godot editor handshake remains healthy.
- Docs describe exact profile counts/membership intent and startup configuration examples.

- [ ] Write the integration test first and verify RED because profile startup/discovery is absent.
- [ ] Implement only any missing plumbing exposed by that test.
- [ ] Document `.godot-mcp/config.json`, CLI/server overrides, immutable session behavior, profile/capability distinction and discovery pagination.
- [ ] Update README capability summary and examples without claiming multi-version support.
- [ ] Run static/test syntax checks.
- [ ] Commit `test(tooling): verify profiled MCP surface`.

### Task 7: Verification and transport

**Files:** no production changes expected.

- [ ] Run `git diff --check`, `git status --short`, and `git show --check` for every Phase 6 commit.
- [ ] Run TypeScript syntax/transpile checks for all changed `.ts` files.
- [ ] Run `npm run build`, `npm run typecheck`, unit tests, `check:godot`, standard integration, runtime and visual locally only if dependencies/Godot are actually available; otherwise state the exact unavailable gate.
- [ ] Generate an incremental patch from Phase 5 v3 HEAD `546e34d5972df393f2cc5495da9b42f2f41776af`.
- [ ] Generate a complete bundle containing Phase 6 history.
- [ ] Clone the exact Phase 5 v3 bundle, apply the incremental patch with `git am --keep-cr`, compare source/simulation tree hashes and require clean status.
- [ ] Hand off exact Windows PowerShell gates. Do not close Phase 6 until fresh Windows evidence is green.
