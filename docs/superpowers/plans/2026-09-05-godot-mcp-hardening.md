# Godot MCP Hardening & Maintainability Implementation Plan

> **For agentic workers:** execute task-by-task with TDD. Do not add unrelated features while this plan is active.

**Goal:** Harden the current post-Plan-2 implementation so risky operations require a real MCP host/user approval, reflective calls have a conservative safety boundary, protocol errors remain extensible but validated, and the MCP registration layer is maintainable.

**Architecture:** Keep the existing MCP → Node → loopback WebSocket → Godot architecture unchanged. Move risk approval to MCP `input_required`/elicitation at the registrar boundary, keep policy assessment/auditing in `ToolPolicy`, and split `create-server.ts` into focused tool-registration modules without changing tool names or schemas.

**Tech Stack:** Node.js >=22, TypeScript, MCP TypeScript SDK v2, Zod v4, Vitest, GDScript/Godot 4.x.

**Spec:** `docs/superpowers/specs/2026-09-05-godot-mcp-design.md`

## Global Constraints

- Windows is the v1 target; Godot 4.x only.
- One active project/instance at a time.
- Node ↔ Godot stays loopback-only.
- No arbitrary eval or arbitrary GDScript execution strings.
- Dangerous permission changes remain session-scoped.
- Risky operations require an explicit user/host approval; the model must not receive a bearer token it can self-submit.
- Screenshots/session artifacts remain persistent and git-ignored.
- Public tool names and existing Plan 1/2 semantics remain backward-compatible unless a security defect requires tightening.

---

### Task 1: Replace self-approval tokens with MCP host elicitation

**Files:**
- Modify: `packages/server/src/security/tool-policy.ts`
- Modify: `packages/server/src/security/tool-registrar.ts`
- Modify: `packages/server/test/tool-policy.test.ts`
- Modify: `packages/server/test/mcp-server.test.ts`

**Interfaces:**
- `ToolPolicy.assess(name,args)` remains the authority for `normal | risky | blocked`.
- `ToolPolicy.execute(..., authorization?)` executes risky work only when registrar-side approval supplies the current approved fingerprint.
- `guardedRegistrar(...)` requests a boolean confirmation using MCP v2 `input_required` and only executes after accepted human/client input.

**Test cycle:**
1. Add a failing test proving a risky call no longer returns a reusable confirmation token.
2. Add a failing MCP-level test proving accepted elicitation executes exactly once and decline/cancel do not execute.
3. Implement the smallest policy/registrar split to pass.
4. Re-run focused tests and syntax checks.

### Task 2: Harden reflective `object.call`

**Files:**
- Modify: `packages/server/src/security/tool-policy.ts`
- Create: `packages/server/src/security/reflection-safety.ts`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/safety_policy.gd`
- Modify: `packages/server/test/tool-policy.test.ts`
- Create: `packages/server/test/reflection-safety.test.ts`
- Modify: `docs/tools/security.md` (create if absent)

**Interfaces:**
- Private (`_...`) and engine escape/bypass methods are blocked.
- Other reflective calls remain `risky` and therefore require host approval.
- The approval preview includes target + method so a human can see what is being authorized.

**Test cycle:**
1. Add failing tests for private and bypass methods (`call`, `callv`, `set`, `set_script`, `free`, `queue_free`, deferred/RPC escape methods).
2. Add a test showing a normal user-script method is `risky`, not silently `normal` or blocked.
3. Implement policy and documentation.

### Task 3: Validate extensible bridge error codes

**Files:**
- Modify: `packages/protocol/src/errors.ts`
- Modify: `packages/protocol/test/rpc.test.ts`
- Modify: `packages/protocol/src/index.ts` only if export changes are required.

**Interfaces:**
- Export `KNOWN_BRIDGE_ERROR_CODES` and `KnownBridgeErrorCode`.
- Runtime schema accepts known codes plus extension codes matching `^[A-Z][A-Z0-9_]{2,63}$`.
- Runtime schema rejects arbitrary lowercase/free-form strings.

**Test cycle:**
1. Add failing tests for `pepe`, whitespace, and overlong codes.
2. Add passing tests for known codes and `CUSTOM_PLUGIN_ERROR`.
3. Implement schema.

### Task 4: Split the monolithic MCP registration module

**Files:**
- Modify: `packages/server/src/mcp/create-server.ts`
- Create: `packages/server/src/mcp/register-core-tools.ts`
- Create: `packages/server/src/mcp/register-object-tools.ts`
- Create: `packages/server/src/mcp/register-scene-tools.ts`
- Create: `packages/server/src/mcp/register-node-tools.ts`
- Create: `packages/server/src/mcp/register-resource-tools.ts`
- Create: `packages/server/src/mcp/register-script-tools.ts`
- Create: `packages/server/src/mcp/register-signal-tools.ts`
- Create: `packages/server/src/mcp/register-project-tools.ts`
- Create: `packages/server/src/mcp/register-editor-tools.ts`
- Create: `packages/server/src/mcp/register-visual-tools.ts`
- Modify: `packages/server/test/mcp-server.test.ts`

**Interfaces:**
- Tool names, input schemas, descriptions, and handlers stay unchanged.
- `createMcpServer()` becomes composition/orchestration only.

**Test cycle:**
1. Add/retain a tool-list contract test that records the complete expected tool set.
2. Extract one group at a time.
3. Run syntax check after every extraction and contract test when dependencies are available.

### Task 5: Source hygiene and open-source hardening

**Files:**
- Create: `.editorconfig`
- Create: `.gitattributes`
- Modify: touched TypeScript files for readable formatting.
- Modify: `README.md` and/or `docs/tools/security.md` to document approval behavior and security boundary.

**Requirements:**
- UTF-8, LF in repository source files, final newline.
- No machine-specific paths/secrets.
- No generated session artifacts committed.
- No single-line minified application modules in touched hardening code.

**Verification:**
- `git diff --check`
- TypeScript syntax transpilation for every `packages/**/*.ts` and `tests/**/*.ts` file.
- Focused tests/full tests when dependencies are available.
- Real Godot integration remains a Windows gate and must be re-run before merge/release.
