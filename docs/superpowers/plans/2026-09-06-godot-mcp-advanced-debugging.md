# Godot MCP Phase 9 — Advanced Debugging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session-owned source breakpoints, stack/variable inspection with bounded lazy expansion, continue, and source-level stepping for the MCP-owned Godot runtime without weakening existing runtime/headless ownership boundaries.

**Architecture:** Keep `RuntimeService` authoritative for runtime lifecycle and add a separate `DebuggerService` that attaches only to the local Godot DAP endpoint correlated with the current session-owned run. Breakpoint mutation stays on the addon/editor-debugger side using `EditorDebuggerSession.set_breakpoint()` plus a server-owned registry, while DAP is used only for stopped-context stack/scopes/variables and continue/step control.

**Tech Stack:** Node.js 22+, TypeScript 7, Zod 4, Vitest 4, raw TCP via `node:net` for DAP framing, Godot 4.6.3 GDScript editor plugin APIs, MCP SDK 2.x.

**Spec:** `docs/superpowers/specs/2026-09-06-godot-mcp-advanced-debugging-design.md`

## Global Constraints

- Authoritative Phase 8 baseline tree: `3b66e0eb3b21c82f49e79ec2987d37957782cf33`.
- Exact execution baseline after the approved design commit: tree `8bfb3dba5272897cdad8e575fff1420db42b1d48` at local commit `28eb6c628a63399c4963f59a00a44a7b88d7beaf`; tree identity is authoritative if commit metadata changes through `git am`.
- Godot 4.6.3 on Windows is the authoritative runtime/integration environment.
- Add exactly ten canonical public tools: `debug.breakpoint.set`, `debug.breakpoint.remove`, `debug.breakpoint.list`, `debug.stack`, `debug.variables`, `debug.expand`, `debug.continue`, `debug.step_into`, `debug.step_over`, `debug.step_out`.
- Expected final public surface: 183 total, 39 canonical, 144 legacy; `runtime=48`, `full=183`; every other profile count remains unchanged.
- Existing `runtime.*` inspection remains blocked in `breaked` with `RUNTIME_BREAKED`; Phase 9 uses a separate `debug.*` lane.
- MCP breakpoints are session-owned. Never adopt, remove, disable, or overwrite a manual breakpoint. Same-location collisions fail `BREAKPOINT_OWNERSHIP_CONFLICT`.
- Manual removal/disable of an MCP breakpoint wins and removes it from MCP desired/owned state.
- Breakpoints survive runtime stop/restart within the same MCP session; frame/variable references never survive continue, stepping, restart, stop, disconnect, a new stop, or session shutdown.
- DAP is local-only. Tool arguments never expose host, port, process ID, adapter executable, raw DAP request, expression evaluation, function invocation, or variable mutation.
- Debug execution controls are normal mutations, not `control`-tagged privileged shutdown tools and not risky/elicited operations.
- `runtime.stop` remains authoritative during debugger break and session shutdown.
- Bounded debugger values: default child page 100, maximum 500, and string display representations capped at 4096 UTF-16 code units with explicit truncation metadata.
- Root cause before fixes for every unexpected test/integration failure. Do not patch symptoms or weaken earlier gates.
- TDD for production behavior: add a failing test, verify the expected failure, implement the minimum behavior, re-run focused tests, then commit.
- Incremental commits only. No unrelated refactors, push, merge, release, or Phase 10 work.
- Generate catalog/policy/inventory only through `npm run generate:tool-contracts`.
- Before declaring Phase 9 GREEN, rerun all pre-existing Windows/Godot gates plus the dedicated debugger gate.

---

## File Structure Map

### New protocol surface

- `packages/protocol/src/debugger.ts` — public debugger schemas, result types, bridge breakpoint snapshot/info schemas, constants for paging/value truncation.
- `packages/protocol/test/debugger.test.ts` — strict schema and bounds tests for all Phase 9 inputs/results.

### New server debugger subsystem

- `packages/server/src/debugger/dap-transport.ts` — raw DAP TCP framing, request/response correlation, event delivery, disconnect handling; no project/runtime policy.
- `packages/server/src/debugger/debug-reference-store.ts` — opaque UUID mapping scoped to runtime/break generations; no network I/O.
- `packages/server/src/debugger/debugger-service.ts` — runtime correlation, DAP handshake/state machine, break context, breakpoint ownership registry, lazy variable mapping, control serialization, lifecycle cleanup.
- `packages/server/src/tools/advanced-debug-tools.ts` — thin handler functions delegating to `DebuggerService`.
- `packages/server/src/mcp/register-debugger-tools.ts` — ten typed canonical MCP bindings only.

### Existing server files to modify

- `packages/server/src/runtime/runtime-service.ts` — expose read-only state subscription so `DebuggerService` can attach/detach at runtime generation changes without becoming lifecycle owner.
- `packages/server/src/bridge/bridge-server.ts` — forward addon debugger events and provide a post-hello `onConnected` lifecycle callback.
- `packages/server/src/mcp/create-server.ts` — register the ten advanced debugger tools while preserving existing four legacy diagnostic `debug.*` tools.
- `packages/server/src/index.ts` — instantiate one `DebuggerService`, wire runtime/editor events, and close debugger before `RuntimeService`/bridge shutdown.
- `packages/server/src/security/tool-policy.ts` — map debugger runtime mutations to runtime permissions without adding them to privileged `CONTROL_TOOL_NAMES`.
- `packages/server/src/index.ts` exports if tests need explicit construction types; do not broaden package exports unless required by existing test patterns.

### Godot addon files to modify

- `packages/godot-addon/addons/godot_mcp/debugger/editor_debugger.gd` — breakpoint inventory, MCP origin guard, per-session apply/reapply, manual-change notifications, debugger endpoint discovery.
- `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd` — route only the private bridge RPC methods `debugger.info`, `debugger.breakpoint.set`, `debugger.breakpoint.remove`.

### Contract/generated files

- `scripts/tool-contracts.json` — ten canonical Phase 9 entries.
- `scripts/generate-tool-contracts.mjs` — update the authoritative expected count from 173 to 183 only; generator semantics remain unchanged.
- `packages/server/src/tooling/tool-catalog.generated.ts` — regenerated.
- `packages/server/src/security/tool-policy.generated.ts` — regenerated.
- `docs/generated/tool-inventory.md` — regenerated.

### Tests and fixtures

- `packages/server/test/dap-transport.test.ts` — fragmentation/coalescing/UTF-8/request/event/disconnect tests.
- `packages/server/test/debug-reference-store.test.ts` — generation and stale reference tests.
- `packages/server/test/debugger-service.test.ts` — fake transport + fake bridge/runtime state-machine/ownership/control tests.
- `packages/server/test/debugger-addon-contract.test.ts` — static/addon boundary contract assertions.
- `packages/server/test/advanced-debug-tools.test.ts` — handler delegation.
- `packages/server/test/tool-catalog.test.ts` — final counts/profile membership.
- `packages/server/test/tool-contract-generator.test.ts` — canonical total 39 and generated binding coverage.
- `packages/server/test/tool-policy.test.ts` — exact Phase 9 risk/permission/control-lane classification.
- `packages/server/test/server-lifecycle.test.ts` — one shared `DebuggerService` and shutdown ordering regression.
- `tests/integration/runtime-debugger-advanced.test.ts` — real Godot 4.6.3 breakpoint/stack/variables/step/restart/manual preservation gate.
- `tests/integration/helpers/runtime-harness.ts` — deterministic DAP/debug-server port overrides and Phase 9 fixture options.
- `fixtures/runtime-project/debug_target.gd` — unopened-script/call-depth/lazy-value fixture.
- `fixtures/runtime-project/main.tscn` — add a `DebugTarget` child using `res://debug_target.gd`; keep the script unopened in Script Editor.
- `scripts/run-integration.mjs` — add `--debugger` selection.
- `package.json` — add `test:integration:debugger` script.
- `docs/tools/runtime-debugger.md` — document Phase 9 behavior and boundaries after implementation is green.
- `docs/testing/runtime-validation.md` — record the dedicated debugger gate and manual validation procedure after green evidence exists.

---

### Task 1: Define the Phase 9 protocol surface and structured errors

**Files:**
- Create: `packages/protocol/src/debugger.ts`
- Create: `packages/protocol/test/debugger.test.ts`
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/protocol/src/events.ts`
- Modify: `packages/protocol/src/errors.ts`
- Modify: `packages/server/src/runtime/runtime-service.ts`
- Modify: `packages/server/test/runtime-service.test.ts`

**Interfaces:**
- Produces: `DebugBreakpointPathSchema`, `DebugBreakpointSetSchema`, `DebugBreakpointRemoveSchema`, `DebugBreakpointListSchema`, `DebugStackSchema`, `DebugVariablesSchema`, `DebugExpandSchema`, `DebugContinueSchema`, `DebugStepIntoSchema`, `DebugStepOverSchema`, `DebugStepOutSchema`.
- Produces: result schemas/types for breakpoint list/set/remove, stack frames, scopes/variables, expansion pages, and control acknowledgements.
- Produces: private bridge schemas `DebuggerInfoResultSchema`, `DebuggerBreakpointSnapshotSchema`, `DebuggerBreakpointApplyResultSchema`, and `DebuggerBreakpointRemoveBridgeResultSchema`.
- Produces: `MAX_DEBUG_VARIABLE_PAGE=500`, `DEFAULT_DEBUG_VARIABLE_PAGE=100`, `MAX_DEBUG_VALUE_CHARS=4096`.
- Extends: `BridgeRuntimeEventSchema` with one `debugger.breakpoints` snapshot event; keep the exported type name for compatibility.

- [ ] **Step 1: Write strict protocol tests that fail because debugger schemas do not exist**

Create `packages/protocol/test/debugger.test.ts` with focused assertions:

```ts
import { describe, expect, it } from 'vitest';
import {
  DebugBreakpointSetSchema,
  DebugExpandSchema,
  DebugStackResultSchema,
  DebugVariablesResultSchema,
  MAX_DEBUG_VARIABLE_PAGE,
  MAX_DEBUG_VALUE_CHARS
} from '../src/debugger.js';

describe('advanced debugger protocol', () => {
  it('accepts only confined 1-based GDScript breakpoint inputs', () => {
    expect(DebugBreakpointSetSchema.parse({script_path:'res://actors/player.gd',line:1}))
      .toEqual({script_path:'res://actors/player.gd',line:1});
    for (const script_path of ['../player.gd','C:/player.gd','user://player.gd','res://../player.gd','res:\\player.gd','res://player.txt']) {
      expect(DebugBreakpointSetSchema.safeParse({script_path,line:1}).success, script_path).toBe(false);
    }
    expect(DebugBreakpointSetSchema.safeParse({script_path:'res://player.gd',line:0}).success).toBe(false);
    expect(DebugBreakpointSetSchema.safeParse({script_path:'res://player.gd',line:1,extra:true}).success).toBe(false);
  });

  it('bounds lazy variable expansion', () => {
    expect(DebugExpandSchema.parse({variable_ref:'11111111-1111-4111-8111-111111111111'}))
      .toEqual({variable_ref:'11111111-1111-4111-8111-111111111111',start:0,limit:100});
    expect(MAX_DEBUG_VARIABLE_PAGE).toBe(500);
    expect(MAX_DEBUG_VALUE_CHARS).toBe(4096);
    expect(DebugExpandSchema.safeParse({variable_ref:'11111111-1111-4111-8111-111111111111',start:0,limit:501}).success).toBe(false);
  });

  it('models opaque frame and variable references without backend ids', () => {
    expect(DebugStackResultSchema.safeParse({
      breakId:'11111111-1111-4111-8111-111111111111',
      frames:[{frameId:'22222222-2222-4222-8222-222222222222',name:'target',scriptPath:'res://debug_target.gd',line:12,column:3}]
    }).success).toBe(true);
    expect(DebugVariablesResultSchema.safeParse({
      frameId:'22222222-2222-4222-8222-222222222222',
      scopes:[{name:'Locals',variables:[{name:'health',type:'int',value:'75',variableRef:null,valueTruncated:false}]}]
    }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the protocol test and confirm the expected missing-module/export failure**

Run:

```powershell
npx vitest run packages/protocol/test/debugger.test.ts
```

Expected: FAIL because `../src/debugger.js` and its exports do not exist.

- [ ] **Step 3: Implement `packages/protocol/src/debugger.ts` with exact public contracts**

Use strict Zod objects and one shared path schema:

```ts
import * as z from 'zod/v4';

export const DEFAULT_DEBUG_VARIABLE_PAGE=100;
export const MAX_DEBUG_VARIABLE_PAGE=500;
export const MAX_DEBUG_VALUE_CHARS=4096;

export const DebugBreakpointPathSchema=z.string().min(1).max(1024)
  .regex(/^res:\/\/.+\.gd$/)
  .refine(p=>!p.includes('..')&&!p.includes('\\')&&!p.includes('\0')&&!p.slice(6).includes(':')&&!p.slice(6).includes('//'));
const DebugLineSchema=z.number().int().min(1);
const EmptyDebugSchema=z.strictObject({});

export const DebugBreakpointSetSchema=z.strictObject({script_path:DebugBreakpointPathSchema,line:DebugLineSchema});
export const DebugBreakpointRemoveSchema=DebugBreakpointSetSchema;
export const DebugBreakpointListSchema=EmptyDebugSchema;
export const DebugStackSchema=EmptyDebugSchema;
export const DebugVariablesSchema=z.strictObject({frame_id:z.uuid()});
export const DebugExpandSchema=z.strictObject({
  variable_ref:z.uuid(),
  start:z.number().int().nonnegative().default(0),
  limit:z.number().int().min(1).max(MAX_DEBUG_VARIABLE_PAGE).default(DEFAULT_DEBUG_VARIABLE_PAGE)
});
export const DebugContinueSchema=EmptyDebugSchema;
export const DebugStepIntoSchema=EmptyDebugSchema;
export const DebugStepOverSchema=EmptyDebugSchema;
export const DebugStepOutSchema=EmptyDebugSchema;

export const DebugBreakpointSchema=z.strictObject({scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema});
export const DebugBreakpointSetResultSchema=z.strictObject({scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema,owned:z.literal(true),applied:z.boolean()});
export const DebugBreakpointRemoveResultSchema=z.strictObject({scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema,removed:z.literal(true)});
export const DebugBreakpointListResultSchema=z.strictObject({scope:z.literal('session_owned'),breakpoints:z.array(DebugBreakpointSchema).max(4096)});

export const DebugStackFrameSchema=z.strictObject({frameId:z.uuid(),name:z.string().max(1024),scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema,column:z.number().int().min(1)});
export const DebugStackResultSchema=z.strictObject({breakId:z.uuid(),frames:z.array(DebugStackFrameSchema).max(1024)});
export const DebugVariableSchema=z.strictObject({name:z.string().max(1024),type:z.string().max(1024),value:z.string().max(MAX_DEBUG_VALUE_CHARS),variableRef:z.uuid().nullable(),valueTruncated:z.boolean()});
export const DebugScopeSchema=z.strictObject({name:z.string().max(1024),variables:z.array(DebugVariableSchema).max(MAX_DEBUG_VARIABLE_PAGE)});
export const DebugVariablesResultSchema=z.strictObject({frameId:z.uuid(),scopes:z.array(DebugScopeSchema).max(64)});
export const DebugExpandResultSchema=z.strictObject({variableRef:z.uuid(),start:z.number().int().nonnegative(),entries:z.array(DebugVariableSchema).max(MAX_DEBUG_VARIABLE_PAGE),nextCursor:z.number().int().nonnegative().nullable()});
export const DebugControlActionSchema=z.enum(['continue','step_into','step_over','step_out']);
export const DebugControlResultSchema=z.strictObject({accepted:z.literal(true),runId:z.uuid(),action:DebugControlActionSchema});

export const DebuggerBreakpointSnapshotSchema=z.strictObject({breakpoints:z.array(DebugBreakpointSchema).max(4096)});
export const DebuggerBreakpointApplyResultSchema=z.strictObject({scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema,applied:z.boolean()});
export const DebuggerBreakpointRemoveBridgeResultSchema=z.strictObject({scriptPath:DebugBreakpointPathSchema,line:DebugLineSchema,removed:z.boolean()});
export const DebuggerInfoResultSchema=z.strictObject({
  dapHost:z.literal('127.0.0.1'),dapPort:z.number().int().min(1024).max(65535),
  debugHost:z.literal('127.0.0.1'),debugPort:z.number().int().min(1024).max(65535),
  breakpointOwnerSessionId:z.string().min(1).max(256).nullable(),
  breakpoints:z.array(DebugBreakpointSchema).max(4096),
  mcpBreakpoints:z.array(DebugBreakpointSchema).max(4096)
});
```

Export inferred types for every public result/params type used by the server.

- [ ] **Step 4: Export the debugger module and add debugger-specific errors**

In `packages/protocol/src/index.ts` add:

```ts
export * from './debugger.js';
```

Append these known codes in `packages/protocol/src/errors.ts`:

```ts
'DEBUGGER_UNAVAILABLE',
'DEBUGGER_ATTACH_FAILED',
'DEBUG_CONTROL_BUSY',
'STALE_DEBUG_REFERENCE',
'DEBUG_FRAME_NOT_FOUND',
'DEBUG_VARIABLE_NOT_FOUND',
'BREAKPOINT_NOT_OWNED',
'BREAKPOINT_OWNERSHIP_CONFLICT',
'BREAKPOINT_INVALID_PATH',
'BREAKPOINT_INVALID_LINE',
'BREAKPOINT_APPLY_FAILED',
'DEBUG_PROTOCOL_ERROR',
'RUNTIME_NOT_BREAKED',
```

Keep existing runtime error codes untouched.

- [ ] **Step 5: Extend the bridge event schema with bounded breakpoint snapshots**

In `packages/protocol/src/events.ts`, import `DebuggerBreakpointSnapshotSchema` and add this discriminant:

```ts
z.strictObject({...envelope,event:z.literal('debugger.breakpoints'),data:DebuggerBreakpointSnapshotSchema})
```

Do not rename `BridgeRuntimeEventSchema` or `BridgeRuntimeEvent`; that would create unrelated churn.

- [ ] **Step 6: Add the minimal server compatibility regression for the widened bridge-event union**

Because `RuntimeService.acceptEvent()` currently treats every non-`runtime.state` event as diagnostics and reads `event.data.runId`, the new `debugger.breakpoints` discriminant would otherwise make the server typecheck invalid. Add a failing case to `packages/server/test/runtime-service.test.ts`, then narrow the existing branch explicitly:

```ts
acceptEvent(event:BridgeRuntimeEvent):void {
  if(event.sessionId!==this.session.id)return;
  if(event.event==='runtime.state') {
    if(event.data.runId!==this.current.runId)return;
    this.apply(event.data);
  } else if(event.event==='runtime.diagnostics' && this.known.has(event.data.runId)) {
    void this.diagnostics.append(event.data).catch(()=>{});
  }
}
```

The test sends a valid `debugger.breakpoints` event and verifies it is ignored by `RuntimeService` without changing runtime state or diagnostics. Task 5 later subscribes `DebuggerService` to the same event; do not put debugger behavior in `RuntimeService`.

- [ ] **Step 7: Run focused protocol + compatibility tests**

Run:

```powershell
npm run test --workspace @godot-mcp/protocol
npx vitest run packages/server/test/runtime-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the protocol slice**

```powershell
git add packages/protocol/src/debugger.ts packages/protocol/test/debugger.test.ts packages/protocol/src/index.ts packages/protocol/src/events.ts packages/protocol/src/errors.ts packages/server/src/runtime/runtime-service.ts packages/server/test/runtime-service.test.ts
git commit -m "feat(protocol): define advanced debugger contracts"
```

---

### Task 2: Add the Godot addon breakpoint and endpoint boundary

**Files:**
- Modify: `packages/godot-addon/addons/godot_mcp/debugger/editor_debugger.gd`
- Modify: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`
- Create: `packages/server/test/debugger-addon-contract.test.ts`

**Interfaces:**
- Private bridge RPC `debugger.info({}) -> DebuggerInfoResult`, including editor inventory, addon MCP-mirror inventory, and the mirror owner session ID.
- Private bridge RPC `debugger.breakpoint.set({script_path,line}) -> {scriptPath,line,applied}`.
- Private bridge RPC `debugger.breakpoint.remove({script_path,line}) -> {scriptPath,line,removed}`.
- Addon event `runtime_event.emit('debugger.breakpoints',{breakpoints:[...]})` for manual/editor-origin inventory changes.
- The addon keeps only a mirror of MCP desired breakpoints needed for pre-run `_setup_session`; the server remains ownership authority.

- [ ] **Step 1: Write a failing addon contract test**

Create `packages/server/test/debugger-addon-contract.test.ts` that reads the GDScript source and asserts the approved boundary:

```ts
import fs from 'node:fs/promises';
import { expect, it } from 'vitest';

it('exposes individual breakpoint mutation and local debugger discovery without raw DAP forwarding', async()=>{
  const source=await fs.readFile(new URL('../../godot-addon/addons/godot_mcp/debugger/editor_debugger.gd',import.meta.url),'utf8');
  expect(source).toContain('get_breakpoints()');
  expect(source).toContain('set_breakpoint(');
  expect(source).toContain('network/debug_adapter/remote_port');
  expect(source).toContain('network/debug/remote_port');
  expect(source).toContain('debugger.breakpoints');
  expect(source).not.toContain('debug.send_dap_request');
  expect(source).not.toContain('setVariable');
});
```

Also assert `rpc_dispatcher.gd` contains exactly the three private `debugger.*` bridge methods above and no public raw debugger passthrough.

- [ ] **Step 2: Run the addon contract test and verify it fails**

Run:

```powershell
npx vitest run packages/server/test/debugger-addon-contract.test.ts
```

Expected: FAIL on missing debugger RPC/inventory methods.

- [ ] **Step 3: Implement safe breakpoint inventory parsing in `editor_debugger.gd`**

Add helpers that use the public ScriptEditor inventory so same-location manual collisions are visible even if a script is not open:

```gdscript
var _mcp_breakpoints: Dictionary = {}
var _mcp_breakpoint_session := ""
var _mcp_origin_depth := 0

func _breakpoint_key(path: String, line: int) -> String:
    return "%s:%d" % [path, line]

func _safe_debug_script(path: String) -> bool:
    if not path.begins_with("res://") or not path.ends_with(".gd") or path.contains("..") or path.contains("\\") or path.contains("\u0000"):
        return false
    var relative := path.trim_prefix("res://")
    if relative.is_empty():
        return false
    var directory := DirAccess.open("res://")
    if directory == null:
        return false
    var partial := ""
    for part in relative.split("/"):
        if part.is_empty() or part.contains(":"):
            return false
        partial = part if partial.is_empty() else partial + "/" + part
        if directory.is_link(partial):
            return false
    return true

func _breakpoint_inventory() -> Array:
    var result: Array = []
    var script_editor = _editor.get_script_editor()
    for item in script_editor.get_breakpoints():
        var text := str(item)
        var split := text.rfind(":")
        if split <= 5:
            continue
        var path := text.substr(0, split)
        var line := int(text.substr(split + 1))
        if path.begins_with("res://") and path.ends_with(".gd") and line >= 1:
            result.append({"scriptPath":path,"line":line})
    result.sort_custom(func(a,b): return a.scriptPath < b.scriptPath or (a.scriptPath == b.scriptPath and a.line < b.line))
    return result
```

Do not infer manual ownership from `_mcp_breakpoints`; the inventory represents editor truth, and `_mcp_breakpoints` is only the addon mirror of server-desired entries.

- [ ] **Step 4: Implement debugger endpoint discovery with command-line override support**

Add helpers that return loopback-only endpoint data and honor integration/editor command-line overrides before falling back to Editor Settings:

```gdscript
func _cmdline_value(flag: String) -> String:
    var args := OS.get_cmdline_args()
    for i in range(args.size()):
        var current := str(args[i])
        if current == flag and i + 1 < args.size():
            return str(args[i + 1])
        if current.begins_with(flag + "="):
            return current.substr(flag.length() + 1)
    return ""

func debugger_info() -> Dictionary:
    var settings = _editor.get_editor_settings()
    var dap_port := int(_cmdline_value("--dap-port"))
    if dap_port <= 0:
        dap_port = int(settings.get_setting("network/debug_adapter/remote_port"))
    var debug_host := str(settings.get_setting("network/debug/remote_host"))
    var debug_port := int(settings.get_setting("network/debug/remote_port"))
    var debug_server := _cmdline_value("--debug-server")
    if debug_server.begins_with("tcp://127.0.0.1:"):
        debug_host = "127.0.0.1"
        debug_port = int(debug_server.trim_prefix("tcp://127.0.0.1:"))
    elif debug_server.begins_with("tcp://localhost:"):
        debug_host = "127.0.0.1"
        debug_port = int(debug_server.trim_prefix("tcp://localhost:"))
    if debug_host not in ["127.0.0.1", "localhost"]:
        return _error("DEBUGGER_UNAVAILABLE","Debugger endpoint is not loopback")
    if dap_port < 1024 or dap_port > 65535 or debug_port < 1024 or debug_port > 65535:
        return _error("DEBUGGER_UNAVAILABLE","Debugger endpoint port is invalid")
    return {
        "dapHost":"127.0.0.1","dapPort":dap_port,"debugHost":"127.0.0.1","debugPort":debug_port,
        "breakpointOwnerSessionId":_mcp_breakpoint_session if not _mcp_breakpoint_session.is_empty() else null,
        "breakpoints":_breakpoint_inventory(),"mcpBreakpoints":_owned_breakpoint_inventory()
    }

func _owned_breakpoint_inventory() -> Array:
    var result: Array = []
    for value in _mcp_breakpoints.values():
        result.append(value.duplicate(true))
    result.sort_custom(func(a,b): return a.scriptPath < b.scriptPath or (a.scriptPath == b.scriptPath and a.line < b.line))
    return result
```

Reject invalid/out-of-range ports with `DEBUGGER_UNAVAILABLE` rather than returning an arbitrary endpoint.

Integrate the addon mirror with the existing authenticated MCP session binding without touching editor breakpoints:

```gdscript
func bind_session(session_id: String) -> void:
    if _mcp_session != session_id:
        _cancel_pending("RUNTIME_NOT_CONNECTED","MCP session changed")
    if not _mcp_breakpoint_session.is_empty() and _mcp_breakpoint_session != session_id:
        # A previous MCP process may have died before cleanup. Forget ownership proof,
        # but leave physical editor breakpoints untouched so the new session cannot adopt them.
        _mcp_breakpoints.clear()
    _mcp_breakpoint_session = session_id
    _mcp_session = session_id
    _publish()
    _publish_breakpoints()

func unbind_session() -> void:
    _mcp_session = ""
    _cancel_pending("EDITOR_NOT_CONNECTED","Editor bridge disconnected")
```

`unbind_session()` intentionally leaves `_mcp_breakpoint_session` and `_mcp_breakpoints` intact; a transient bridge reconnect for the same MCP session retains the addon ownership mirror. Graceful session cleanup empties the mirror through individual remove RPCs before the bridge is stopped.

- [ ] **Step 5: Implement individual MCP breakpoint apply/remove with an origin guard**

Add input validation again at the addon boundary and use `EditorDebuggerSession.set_breakpoint()` only for the requested location:

```gdscript
func set_mcp_breakpoint(params: Dictionary) -> Dictionary:
    var path := str(params.get("script_path",""))
    var line := int(params.get("line",0))
    if not _safe_debug_script(path):
        return _error("BREAKPOINT_INVALID_PATH","Breakpoint script is outside project GDScript scope")
    if line < 1:
        return _error("BREAKPOINT_INVALID_LINE","Breakpoint line must be 1-based")
    var key := _breakpoint_key(path,line)
    var already_owned := _mcp_breakpoints.has(key)
    if not already_owned:
        for item in _breakpoint_inventory():
            if item.scriptPath == path and item.line == line:
                return _error("BREAKPOINT_OWNERSHIP_CONFLICT","Breakpoint already exists outside MCP ownership")
    _mcp_breakpoints[key] = {"scriptPath":path,"line":line}
    var applied := false
    _mcp_origin_depth += 1
    for session in get_sessions():
        session.set_breakpoint(path,line,true)
        applied = true
    _mcp_origin_depth -= 1
    return {"scriptPath":path,"line":line,"applied":applied}
```

Implement removal explicitly:

```gdscript
func remove_mcp_breakpoint(params: Dictionary) -> Dictionary:
    var path := str(params.get("script_path",""))
    var line := int(params.get("line",0))
    if not _safe_debug_script(path):
        return _error("BREAKPOINT_INVALID_PATH","Breakpoint script is outside project GDScript scope")
    if line < 1:
        return _error("BREAKPOINT_INVALID_LINE","Breakpoint line must be 1-based")
    var key := _breakpoint_key(path,line)
    if not _mcp_breakpoints.has(key):
        return _error("BREAKPOINT_NOT_OWNED","Breakpoint is not owned by this MCP session")
    _mcp_origin_depth += 1
    for session in get_sessions():
        session.set_breakpoint(path,line,false)
    _mcp_origin_depth -= 1
    _mcp_breakpoints.erase(key)
    return {"scriptPath":path,"line":line,"removed":true}
```

Server-side ownership checks remain authoritative and happen before this bridge call, while the addon repeats the same-location conflict check on set to close the race between server inventory read and mutation.

- [ ] **Step 6: Reapply desired breakpoints in `_setup_session` and observe manual changes**

At the end of `_setup_session(session_id)`, apply every `_mcp_breakpoints` entry to that session while incrementing `_mcp_origin_depth` only around the direct `set_breakpoint()` calls. The guard is an optimization, not a correctness dependency: if Godot delivers a callback asynchronously after the guard returns to zero, publishing the current inventory is harmless and idempotent. This avoids a stale suppression token ever swallowing a later manual user action.

Override editor breakpoint callbacks and define the event publisher explicitly:

```gdscript
func _publish_breakpoints() -> void:
    if _mcp_session.is_empty():
        return
    runtime_event.emit("debugger.breakpoints", {"breakpoints":_breakpoint_inventory()})

func _breakpoint_set_in_tree(_script: Script, _line: int, _enabled: bool) -> void:
    if _mcp_origin_depth == 0:
        _publish_breakpoints()

func _breakpoints_cleared_in_tree() -> void:
    _publish_breakpoints()
```

`_publish_breakpoints()` emits the full bounded, deterministically sorted inventory snapshot. The server reconciles every published snapshot against its owned set; a user disable/remove therefore wins and drops desired ownership. If the callback's line convention differs from the 1-based `ScriptEditor.get_breakpoints()` inventory, the implementation must use the inventory snapshot for reconciliation rather than guessing an offset. Add a focused test that an asynchronous MCP-origin callback is idempotent and that a later manual removal is never suppressed.

- [ ] **Step 7: Route the three private bridge RPCs**

In `rpc_dispatcher.gd` add only:

```gdscript
"debugger.info":
    result = _runtime.debugger_info()
"debugger.breakpoint.set":
    result = _runtime.set_mcp_breakpoint(params)
"debugger.breakpoint.remove":
    result = _runtime.remove_mcp_breakpoint(params)
```

The existing `_runtime` object is the `EditorDebuggerPlugin`, so keep the boundary there rather than adding another addon singleton.

- [ ] **Step 8: Run addon checks**

Run:

```powershell
npx vitest run packages/server/test/debugger-addon-contract.test.ts
npm run check:godot
```

Expected: PASS, with the authoritative local run later repeated against Godot 4.6.3.

- [ ] **Step 9: Commit the addon boundary**

```powershell
git add packages/godot-addon/addons/godot_mcp/debugger/editor_debugger.gd packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd packages/server/test/debugger-addon-contract.test.ts
git commit -m "feat(addon): add owned breakpoint debugger boundary"
```

---

### Task 3: Implement a bounded raw DAP transport

**Files:**
- Create: `packages/server/src/debugger/dap-transport.ts`
- Create: `packages/server/test/dap-transport.test.ts`

**Interfaces:**
- Produces `DapTransport` with `connect(host,port,timeoutMs)`, `request(command,args,timeoutMs)`, `onEvent(listener)`, `onClose(listener)`, and `close()`.
- Produces `TcpDapTransport` for production and a small event/request shape usable by `DebuggerService` tests.
- No policy, project ownership, breakpoint ownership, or MCP concepts in this file.

- [ ] **Step 1: Write failing framing tests with a local fake TCP adapter**

Cover fragmented headers, fragmented UTF-8 bodies, multiple messages in one packet, response correlation, event delivery, failed responses, request timeout, socket close, duplicate/missing/invalid `Content-Length`, an unterminated header exceeding 8 KiB, and a declared body exceeding 8 MiB. Use `node:net.createServer()` and write frames with:

```ts
function frame(value:unknown):Buffer {
  const body=Buffer.from(JSON.stringify(value),'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`,'ascii'),body]);
}
```

A required test must split a multi-byte value such as `"á🐀"` across TCP writes and still produce one valid event.

- [ ] **Step 2: Run the DAP transport test and verify it fails**

```powershell
npx vitest run packages/server/test/dap-transport.test.ts
```

Expected: FAIL because the transport module does not exist.

- [ ] **Step 3: Implement Buffer-based DAP framing**

The parser must never decode partial JSON bodies. Keep an accumulated `Buffer`, parse ASCII headers through `\r\n\r\n`, validate exactly one positive `Content-Length`, wait for the full byte count, then decode the body once as UTF-8.

Reject malformed/oversized frames with a transport error. Cap the header section at 8 KiB before `\r\n\r\n` is found and cap any single DAP body at 8 MiB; if either cap is exceeded, close the transport and reject all pending requests so an adapter cannot grow the receive buffer without bound.

- [ ] **Step 4: Implement request correlation and event delivery**

Use monotonically increasing `seq` values and pending request entries:

```ts
interface PendingDapRequest {
  command:string;
  resolve:(body:Record<string,unknown>)=>void;
  reject:(error:Error)=>void;
  timer:ReturnType<typeof setTimeout>;
}
```

Send requests as:

```ts
{seq,type:'request',command,arguments:args}
```

A DAP response with `success:false` rejects the matching request with an error carrying the command/message. A successful response with no `body` resolves to `{}` so commands such as `configurationDone` do not require a fabricated payload. An `event` is delivered to listeners but never resolves a pending request. A request timeout removes that pending entry before rejecting so a late response cannot resolve it twice.

- [ ] **Step 5: Implement bounded connect/close behavior**

`connect()` accepts only `127.0.0.1` from the caller contract, creates a TCP socket with `setNoDelay(true)`, and rejects after the caller-provided startup timeout. On `error`/`close`, reject every pending request once, clear timers, and notify close listeners. `close()` is idempotent.

- [ ] **Step 6: Run focused transport tests**

```powershell
npx vitest run packages/server/test/dap-transport.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the transport**

```powershell
git add packages/server/src/debugger/dap-transport.ts packages/server/test/dap-transport.test.ts
git commit -m "feat(server): add bounded Godot DAP transport"
```

---

### Task 4: Add generation-scoped opaque debugger references

**Files:**
- Create: `packages/server/src/debugger/debug-reference-store.ts`
- Create: `packages/server/test/debug-reference-store.test.ts`

**Interfaces:**
- `DebugReferenceStore.resetRuntime()` increments runtime generation and invalidates all refs.
- `DebugReferenceStore.beginBreak()` increments break generation, returns `breakId`, and invalidates refs from the previous break.
- `createFrameRef(dapFrameId)` / `resolveFrameRef(frameRef)`.
- `createVariableRef(dapVariablesReference)` / `resolveVariableRef(variableRef)`.
- Stale known UUIDs throw `STALE_DEBUG_REFERENCE`; unknown current-generation refs throw `DEBUG_FRAME_NOT_FOUND` or `DEBUG_VARIABLE_NOT_FOUND` as appropriate.

- [ ] **Step 1: Write failing generation tests**

Create tests for the exact design sequence:

```ts
const refs=new DebugReferenceStore();
refs.resetRuntime();
const breakA=refs.beginBreak();
const frameA=refs.createFrameRef(12);
expect(refs.resolveFrameRef(frameA)).toBe(12);
refs.invalidateBreak();
expect(()=>refs.resolveFrameRef(frameA)).toThrowError(expect.objectContaining({code:'STALE_DEBUG_REFERENCE'}));
const breakB=refs.beginBreak();
expect(breakB).not.toBe(breakA);
```

Also test that a runtime reset makes both old frame and variable refs stale.

- [ ] **Step 2: Run and verify the missing-module failure**

```powershell
npx vitest run packages/server/test/debug-reference-store.test.ts
```

- [ ] **Step 3: Implement UUID-backed mappings with explicit generation metadata**

Keep backend mappings only for the current break, but encode the two 32-bit generation counters into fixed non-version/non-variant UUID bytes and fill the remaining bytes with cryptographic randomness. Preserve RFC 4122 version/variant bits. Conceptually:

```ts
type CurrentRefEntry={kind:'frame'|'variable';backendId:number};
// UUID bytes 0..3 = runtimeGeneration, bytes 12..15 = breakGeneration;
// remaining bytes random, with UUID version/variant bits normalized.
```

`resetRuntime()` increments `runtimeGeneration`, resets `breakGeneration` to zero, and clears both current maps. `beginBreak()` first increments `breakGeneration`, clears both maps, and creates the new `breakId`. `invalidateBreak()` increments `breakGeneration` before clearing both maps, so every ref from the just-ended break becomes stale immediately even before another stop occurs.

`resolve*()` first parses the UUID and compares its embedded generations with the current counters. Any generation mismatch returns `STALE_DEBUG_REFERENCE` without retaining old maps. Only a same-generation UUID is looked up in the current frame/variable map; an absent entry then returns `DEBUG_FRAME_NOT_FOUND` or `DEBUG_VARIABLE_NOT_FOUND`. This gives deterministic stale detection across unlimited runtime/break resets while keeping memory bounded to the current break.

- [ ] **Step 4: Run focused reference tests**

```powershell
npx vitest run packages/server/test/debug-reference-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit opaque reference handling**

```powershell
git add packages/server/src/debugger/debug-reference-store.ts packages/server/test/debug-reference-store.test.ts
git commit -m "feat(server): scope debugger references by generation"
```

---

### Task 5: Implement `DebuggerService` ownership, DAP lifecycle, break context, variables, and control serialization

**Files:**
- Create: `packages/server/src/debugger/debugger-service.ts`
- Create: `packages/server/test/debugger-service.test.ts`
- Modify: `packages/server/src/runtime/runtime-service.ts`
- Modify: `packages/server/test/runtime-service.test.ts`

**Interfaces:**
- `RuntimeService.subscribe(listener:(status:RuntimeStatus)=>void):()=>void` and `RuntimeService.peek():RuntimeStatus` expose read-only lifecycle observation; callers cannot mutate lifecycle.
- `DebuggerService` public methods:

```ts
setBreakpoint(input:DebugBreakpointSetParams):Promise<DebugBreakpointSetResult>
removeBreakpoint(input:DebugBreakpointRemoveParams):Promise<DebugBreakpointRemoveResult>
listBreakpoints():Promise<DebugBreakpointListResult>
stack():Promise<DebugStackResult>
variables(input:DebugVariablesParams):Promise<DebugVariablesResult>
expand(input:DebugExpandParams):Promise<DebugExpandResult>
continueExecution():Promise<DebugControlResult>
stepInto():Promise<DebugControlResult>
stepOver():Promise<DebugControlResult>
stepOut():Promise<DebugControlResult>
editorConnected():Promise<void>
editorDisconnected():void
acceptBridgeEvent(event:BridgeRuntimeEvent):void
close():Promise<void>
```

- Constructor accepts a `DapTransport` factory for deterministic unit tests.
- Internal debugger state is exactly `DETACHED | ATTACHING | READY | BREAKED | RESUMING | UNAVAILABLE`; it is not added to the public runtime status contract. `UNAVAILABLE` is recoverable only on a new runtime generation or editor reconnect, never by attaching to a different host/process.
- `debug.breakpoint.set/remove/list` first require `bridge.connected===true`; otherwise throw existing `EDITOR_NOT_CONNECTED`. They do not require a running runtime.

- [ ] **Step 1: Write a failing `RuntimeService` subscription test**

Add a test that subscribes, starts a fake run, accepts a `breaked` bridge state, and verifies listeners receive immutable status snapshots in order. Unsubscribe and prove later changes are not delivered.

- [ ] **Step 2: Implement the minimum RuntimeService observer without changing lifecycle semantics**

Add:

```ts
private readonly listeners=new Set<(status:RuntimeStatus)=>void>();
peek():RuntimeStatus{return structuredClone(this.current);}
subscribe(listener:(status:RuntimeStatus)=>void):()=>void{this.listeners.add(listener);listener(this.peek());return()=>this.listeners.delete(listener);}
```

At the end of `apply(status)`, notify listeners with copies. Do not route debugger control through `RuntimeService.request()` and do not change its `RUNTIME_BREAKED` rejection.

- [ ] **Step 3: Run RuntimeService tests**

```powershell
npx vitest run packages/server/test/runtime-service.test.ts
```

Expected: PASS including all pre-existing tests.

- [ ] **Step 4: Write failing `DebuggerService` ownership and attach tests with a fake DAP transport**

Create a fake transport that records commands and lets tests emit events. Required assertions:

```text
external runtime -> debug stack/control -> RUNTIME_NOT_OWNED
session-owned running runtime -> local endpoint -> initialize -> attach + initialized -> configurationDone -> READY
DAP attach failure -> DEBUGGER_ATTACH_FAILED and runtime remains session-owned
runId change -> old transport closes and old refs invalidate
```

The handshake must be explicit in tests: send `initialize`, then `attach`; observe Godot's `initialized` event before sending `configurationDone`, and accept that the `attach` response may arrive either before or after configuration completes. The service reaches `READY` only after both `attach` success and `configurationDone` success. `DebuggerService` never sends DAP `launch`, `setBreakpoints`, `evaluate`, or `setVariable`.

- [ ] **Step 5: Implement endpoint discovery and bounded DAP attach**

`DebuggerService` obtains `DebuggerInfoResultSchema.parse(await bridge.rpc.call('debugger.info',{}))`, verifies loopback/ports, and connects only while `runtime.peek().ownership==='session'` with a non-null `runId`. Every private breakpoint RPC result is parsed before use with `DebuggerBreakpointApplyResultSchema` or `DebuggerBreakpointRemoveBridgeResultSchema`, and every `debugger.breakpoints` event payload is parsed with `DebuggerBreakpointSnapshotSchema`; malformed private bridge data becomes `DEBUG_PROTOCOL_ERROR` and never mutates ownership state.

Use exactly 20 connection attempts separated by 100 ms (2 seconds maximum startup window), only for connection-refused startup ordering. Any other transport/protocol error fails immediately as `DEBUGGER_ATTACH_FAILED`.

Use DAP initialization arguments:

```ts
{
  clientID:'godot-mcp',
  clientName:'Godot MCP',
  adapterID:'godot',
  pathFormat:'path',
  linesStartAt1:true,
  columnsStartAt1:true,
  supportsVariableType:true,
  supportsVariablePaging:true
}
```

Send `attach` with `{address:info.debugHost,port:info.debugPort}`. Wait for the DAP `initialized` event before `configurationDone`, while allowing the `attach` response to be deferred until configuration completes; require both requests to succeed before marking the debugger `READY`. If Godot 4.6.3 returns a different required attach field or ordering during the dedicated real gate, stop and perform root-cause analysis against the adapter response/source before changing this contract.

Implement transitions explicitly:

```text
DETACHED --owned run--> ATTACHING --handshake ok--> READY
READY --correlated stopped + runtime breaked--> BREAKED
BREAKED --accepted continue/step--> RESUMING --continued--> READY
any state --runId change/stop/editor disconnect--> DETACHED
ATTACHING/READY/BREAKED/RESUMING --transport failure with same live run--> UNAVAILABLE
UNAVAILABLE --new run generation or editor reconnect--> ATTACHING
```

Never let DAP state change `RuntimeService` lifecycle ownership.

- [ ] **Step 6: Write and implement break-context event tests**

Test both event orderings:

```text
DAP stopped -> runtime.state breaked
runtime.state breaked -> DAP stopped
```

Only after both refer to the current runtime generation may the service establish:

```ts
{breakId,threadId,breakGeneration}
```

A DAP `continued`, `terminated`, `exited`, transport close, runtime stop/restart, or new stop invalidates the old break refs immediately.

- [ ] **Step 7: Write and implement `stack()` tests**

The service sends `stackTrace` for the active stopped thread and converts each backend frame ID into an opaque UUID. Normalize source paths:

```text
project-root absolute path -> res://relative/path.gd
res://path.gd -> unchanged
outside project / non-.gd -> DEBUG_PROTOCOL_ERROR
```

Return only 1-based public line/column values and no backend thread/frame IDs.

- [ ] **Step 8: Write and implement variables + lazy expansion tests**

For `variables(frame_id)`:

1. resolve the opaque frame ref;
2. DAP `scopes({frameId})`;
3. for each scope, DAP `variables({variablesReference,start:0,count:100})`;
4. map simple entries inline;
5. map positive backend `variablesReference` values to new opaque UUIDs;
6. truncate value representations over 4096 code units and set `valueTruncated:true`.

For `expand(variable_ref,start,limit)`, send DAP `variables` with the requested page and return:

```ts
{variableRef,start,entries,nextCursor: entries.length===limit ? start+entries.length : null}
```

Revalidate runtime and break generations after every awaited DAP response; if context changed, throw `STALE_DEBUG_REFERENCE` instead of returning stale data.

- [ ] **Step 9: Write and implement control serialization tests**

Map Phase 9 controls exactly:

```text
debug.continue  -> DAP continue
debug.step_over -> DAP next
debug.step_into -> DAP stepIn
debug.step_out  -> DAP stepOut
```

Before each request verify current runtime is session-owned, debugger transport is attached/ready, `state==='breaked'`, and a current stopped thread exists, in that order. Use the same precedence for `stack()`/variables: `RUNTIME_NOT_OWNED` first, then `DEBUGGER_UNAVAILABLE`, then `RUNTIME_NOT_BREAKED`, then reference-specific errors. Set a synchronous `controlBusy` guard before awaiting DAP. A second overlapping call must fail `DEBUG_CONTROL_BUSY`; do not queue it.

If the DAP control request fails, release `controlBusy` and keep the current break context valid. On a successful DAP response (or an earlier correlated `continued` event), invalidate the current refs immediately, transition to `RESUMING`, release `controlBusy`, and return:

```ts
{accepted:true,runId:<current>,action:'step_over'}
```

Do not wait for the next stop inside the tool call.

- [ ] **Step 10: Write and implement breakpoint ownership tests**

Use a fake bridge inventory and assert these gate invariants:

```text
editor disconnected + breakpoint set/remove/list -> EDITOR_NOT_CONNECTED
manual X + MCP set X -> BREAKPOINT_OWNERSHIP_CONFLICT, no bridge mutation
remove manual X -> BREAKPOINT_NOT_OWNED, no bridge mutation
manual A + MCP B + close -> only B receives debugger.breakpoint.remove
MCP B + debugger.breakpoints snapshot without B -> owned registry drops B; restart does not reapply B
transient reconnect, addon mirror proves B for same session -> B remains owned
reconnect with B in editor inventory but absent from addon MCP mirror -> ownership is ambiguous -> drop B, never remove/adopt it
new MCP session after stale physical B -> addon mirror empty -> B is treated as manual/unowned
```

`setBreakpoint()` must fetch current `debugger.info` before claiming an unowned location. A location already in editor inventory but absent from both the server owned set and the same-session addon `mcpBreakpoints` fails `BREAKPOINT_OWNERSHIP_CONFLICT`. If bridge apply fails, roll back the newly inserted owned registry entry and return `BREAKPOINT_APPLY_FAILED`. Never reconstruct ownership from editor inventory alone.

- [ ] **Step 11: Implement reconnect/restart reconciliation**

`editorConnected()` fetches `debugger.info` and first validates `breakpointOwnerSessionId===session.id`. For each server-owned entry: keep it when the same-session addon mirror also contains it; reapply it when it is absent from both editor inventory and addon mirror; and drop ownership without mutation when editor inventory contains it but addon mirror cannot prove MCP origin. `editorDisconnected()` closes DAP and invalidates stopped context but retains desired owned breakpoints.

A new session-owned `runId` increments runtime generation, closes the old DAP transport, clears transient refs, then attaches to the current local debugger endpoint. Runtime stop preserves breakpoint ownership but tears down DAP context.

- [ ] **Step 12: Implement transport failure isolation**

When DAP closes unexpectedly while runtime is alive:

```text
invalidate break refs
mark debugger unavailable for current transport
never call RuntimeService.stop()
never attach to an alternate process/host
```

Subsequent debugger-context calls return `DEBUGGER_UNAVAILABLE`; `runtime.stop` remains independent.

`close()` must snapshot all server-owned breakpoints, attempt an individual `debugger.breakpoint.remove` for every entry while the bridge is still available, continue cleanup even if one removal fails, then close DAP/invalidate refs. If any owned removal failed, throw after all attempts so server shutdown records failure instead of falsely claiming a clean breakpoint state. Add a test where the first removal fails and the second still executes.

- [ ] **Step 13: Run all DebuggerService-focused tests**

```powershell
npx vitest run packages/server/test/runtime-service.test.ts packages/server/test/debugger-service.test.ts packages/server/test/debug-reference-store.test.ts packages/server/test/dap-transport.test.ts
```

Expected: PASS.

- [ ] **Step 14: Commit the debugger service**

```powershell
git add packages/server/src/runtime/runtime-service.ts packages/server/test/runtime-service.test.ts packages/server/src/debugger packages/server/test/debugger-service.test.ts packages/server/test/debug-reference-store.test.ts packages/server/test/dap-transport.test.ts
git commit -m "feat(server): add session-owned debugger service"
```

---

### Task 6: Expose the ten canonical MCP debugger tools and exact policy/profile metadata

**Files:**
- Create: `packages/server/src/tools/advanced-debug-tools.ts`
- Create: `packages/server/src/mcp/register-debugger-tools.ts`
- Create: `packages/server/test/advanced-debug-tools.test.ts`
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/src/security/tool-policy.ts`
- Modify: `packages/server/test/tool-policy.test.ts`
- Modify: `scripts/tool-contracts.json`
- Modify: `scripts/generate-tool-contracts.mjs`
- Modify: `packages/server/test/tool-contract-generator.test.ts`
- Modify: `packages/server/test/tool-catalog.test.ts`
- Regenerate: `packages/server/src/tooling/tool-catalog.generated.ts`
- Regenerate: `packages/server/src/security/tool-policy.generated.ts`
- Regenerate: `docs/generated/tool-inventory.md`

**Interfaces:**
- Ten canonical bindings use the protocol schemas from Task 1 and `DebuggerService` handlers from Task 5.
- Existing `registerDebugTools()` remains untouched for `debug.output/errors/warnings/performance`.
- New runtime debugger controls receive runtime permissions but are not `CONTROL_TOOL_NAMES`.

- [ ] **Step 1: Write failing thin-handler delegation tests**

Create `packages/server/test/advanced-debug-tools.test.ts` with a fake `DebuggerService`; invoke all ten exported handler functions and assert exact delegate arguments/results. Example:

```ts
await setDebugBreakpoint(service,{script_path:'res://debug_target.gd',line:12});
expect(fake.setBreakpoint).toHaveBeenCalledWith({script_path:'res://debug_target.gd',line:12});
await stepOverDebugger(service,{});
expect(fake.stepOver).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Implement thin handlers**

`advanced-debug-tools.ts` should contain no MCP registration or policy logic:

```ts
export const setDebugBreakpoint=(service:DebuggerService,args:DebugBreakpointSetParams)=>service.setBreakpoint(args);
export const removeDebugBreakpoint=(service:DebuggerService,args:DebugBreakpointRemoveParams)=>service.removeBreakpoint(args);
export const listDebugBreakpoints=(service:DebuggerService,_args:DebugBreakpointListParams)=>service.listBreakpoints();
export const getDebugStack=(service:DebuggerService,_args:DebugStackParams)=>service.stack();
export const getDebugVariables=(service:DebuggerService,args:DebugVariablesParams)=>service.variables(args);
export const expandDebugVariable=(service:DebuggerService,args:DebugExpandParams)=>service.expand(args);
export const continueDebugger=(service:DebuggerService,_args:DebugContinueParams)=>service.continueExecution();
export const stepIntoDebugger=(service:DebuggerService,_args:DebugStepIntoParams)=>service.stepInto();
export const stepOverDebugger=(service:DebuggerService,_args:DebugStepOverParams)=>service.stepOver();
export const stepOutDebugger=(service:DebuggerService,_args:DebugStepOutParams)=>service.stepOut();
```

- [ ] **Step 3: Write canonical bindings using existing Phase 7.1 pattern**

In `register-debugger-tools.ts`, define exactly ten `defineCanonicalToolBinding()` calls and bind them with `bindCanonicalTool()`. Example:

```ts
const debugBreakpointSetTool=defineCanonicalToolBinding('debug.breakpoint.set',{
  inputSchema:DebugBreakpointSetSchema,
  handler:setDebugBreakpoint
});
```

Do not duplicate descriptions in registration code; descriptions remain canonical in `scripts/tool-contracts.json`.

- [ ] **Step 4: Add the ten contract manifest entries and first make contract tests fail on old expected count**

Add entries with `domain:"debug"`, profiles `["runtime","full"]`, and canonical source `packages/server/src/mcp/register-debugger-tools.ts`.

Risk tags:

```text
debug.breakpoint.list  -> [read]
debug.stack            -> [read]
debug.variables        -> [read]
debug.expand           -> [read]
debug.breakpoint.set   -> [normal_mutation]
debug.breakpoint.remove-> [normal_mutation]
debug.continue         -> [normal_mutation]
debug.step_into        -> [normal_mutation]
debug.step_over        -> [normal_mutation]
debug.step_out         -> [normal_mutation]
```

All use `dynamic:"none"`. Run `npm run check:tool-contracts`; expected failure is count 173 vs 183 before the generator constant/test counts are updated.

- [ ] **Step 5: Update authoritative count assertions to 183/39 and regenerate**

Change `DEFAULT_EXPECTED_COUNT` in `scripts/generate-tool-contracts.mjs` from 173 to 183. Update `packages/server/test/tool-contract-generator.test.ts` canonical definition total from 29 to 39 and include `register-debugger-tools.ts` in the canonical source list.

Update `packages/server/test/tool-catalog.test.ts` expected profile counts to:

```ts
{minimal:5,core:78,'2d':121,'3d':107,navigation:67,ui:81,runtime:48,full:183}
```

Add runtime-profile membership assertions for all ten new names and absence from every non-runtime specialized profile.

Run:

```powershell
npm run generate:tool-contracts
npm run check:tool-contracts
```

Expected: `Tool contract artifacts are current (183 tools).`

- [ ] **Step 6: Add debugger tools to `createMcpServer` without replacing legacy diagnostics**

Extend `McpServerContext` with `debugger?:DebuggerService`. Use the injected service in production and construct a lazy fallback only for existing server-construction tests:

```ts
const debuggerService=ctx.debugger ?? new DebuggerService(
  ctx.session,
  ctx.sessions,
  ctx.bridge,
  runtime,
  () => new TcpDapTransport()
);

registerRuntimeTools(registrar,runtime);
registerHeadlessTools(registrar,headless);
registerDebugTools(registrar,runtime);
registerDebuggerTools(registrar,debuggerService);
```

`runServer()` in Task 7 injects its single lifecycle-wired `DebuggerService`; the fallback exists only so callers that construct an MCP server directly continue to receive the full catalog. `DebuggerService` must remain lazy—construction alone performs no DAP connection or editor mutation. The final registry must observe both old and new `debug.*` names exactly once.

- [ ] **Step 7: Add exact policy permission handling for debugger runtime mutations**

In `tool-policy.ts`, add:

```ts
const DEBUG_RUNTIME_MUTATIONS=new Set(['debug.continue','debug.step_into','debug.step_over','debug.step_out']);
```

In `required()` branch these names like existing `runtime.*` mutations:

```ts
else if (name.startsWith('runtime.') || name === 'project.run' || name === 'project.run_scene' || DEBUG_RUNTIME_MUTATIONS.has(name)) {
  permissions.push('runtime.modify','process.godot','filesystem.project');
}
```

Because they are not `CONTROL_TOOL_NAMES`, `network.local` remains required through the existing first branch and they do not become shutdown-exempt.

Breakpoint mutations naturally use `editor.modify + filesystem.project + network.local`; breakpoint paths are fingerprinted through existing `script_path` handling.

- [ ] **Step 8: Write exact policy tests**

Assert:

```text
stack/variables/expand/list -> normal read, no runtime.modify/editor.modify
breakpoint set/remove -> normal, editor.modify + filesystem.project + network.local
continue/step_* -> normal, runtime.modify + process.godot + filesystem.project + network.local
continue/step_* absent from CONTROL_TOOL_NAMES and blocked when session is closing
no Phase 9 tool is risky or requires elicitation
```

Also assert disabling `runtime.modify` blocks continue/step before handler execution and disabling `editor.modify` blocks breakpoint mutation.

- [ ] **Step 9: Run focused binding/catalog/policy tests**

```powershell
npx vitest run packages/server/test/advanced-debug-tools.test.ts packages/server/test/tool-contract-generator.test.ts packages/server/test/tool-catalog.test.ts packages/server/test/tool-policy.test.ts packages/server/test/mcp-server.test.ts
npm run check:tool-contracts
```

Expected: PASS.

- [ ] **Step 10: Commit the public tool surface**

```powershell
git add packages/server/src/tools/advanced-debug-tools.ts packages/server/src/mcp/register-debugger-tools.ts packages/server/test/advanced-debug-tools.test.ts packages/server/src/mcp/create-server.ts packages/server/src/security/tool-policy.ts packages/server/test/tool-policy.test.ts scripts/tool-contracts.json scripts/generate-tool-contracts.mjs packages/server/test/tool-contract-generator.test.ts packages/server/test/tool-catalog.test.ts packages/server/src/tooling/tool-catalog.generated.ts packages/server/src/security/tool-policy.generated.ts docs/generated/tool-inventory.md
git commit -m "feat(mcp): expose canonical advanced debugger tools"
```

---

### Task 7: Wire debugger lifecycle to editor/runtime events and graceful shutdown

**Files:**
- Modify: `packages/server/src/bridge/bridge-server.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/test/bridge-server.test.ts`
- Modify: `packages/server/test/server-lifecycle.test.ts`

**Interfaces:**
- `BridgeServerOptions.onConnected?: (hello:AddonHello)=>void|Promise<void>` is called only after authenticated session state is established and `hello_ack` is queued before subsequent RPC traffic.
- `onRuntimeEvent` continues to deliver `runtime.state`/diagnostics and now also `debugger.breakpoints` through the same validated event envelope.
- `runServer()` owns one `DebuggerService` instance and closes it before runtime/bridge teardown.

- [ ] **Step 1: Write failing bridge lifecycle tests**

Extend `bridge-server.test.ts` to prove:

```text
invalid debugger.breakpoints event -> ignored
valid monotonically sequenced debugger.breakpoints -> forwarded
hello_ack is sent before onConnected-triggered RPC traffic
onDisconnected fires once and leaves session.editorConnected=false
```

- [ ] **Step 2: Implement post-authentication `onConnected`**

After the socket listeners are installed and after sending:

```ts
socket.send(JSON.stringify({type:'hello_ack',protocol:1,sessionId:this.options.session.id}));
```

invoke `void Promise.resolve(this.options.onConnected?.(hello)).catch(...)` without blocking the WebSocket message loop. This is safe whether the callback returns `void` or a promise. Message ordering ensures the addon receives `hello_ack` before any subsequent RPC sent by `editorConnected()` reconciliation.

- [ ] **Step 3: Write a failing server shutdown ordering test**

Use spies/fakes to require this relative order:

```text
debugger.close
before runtime.close
before bridge.stop
```

This guarantees owned breakpoint cleanup can use the editor bridge and debugger transport before either is torn down.

- [ ] **Step 4: Wire one shared DebuggerService in `runServer()`**

Use closure declarations like the existing `runtime` setup:

```ts
let runtime:RuntimeService;
let debuggerService:DebuggerService;
```

Bridge callbacks:

```ts
onRuntimeEvent:event=>{runtime?.acceptEvent(event);debuggerService?.acceptBridgeEvent(event);},
onDisconnected:()=>{runtime?.disconnect();debuggerService?.editorDisconnected();},
onConnected:()=>debuggerService?.editorConnected()
```

Construct `runtime`, then `debuggerService`, then pass both to `createMcpServer`.

Shutdown sequence must include:

```ts
() => debuggerService.close(),
() => runtime.close(),
```

before `bridge.stop()`.

- [ ] **Step 5: Run bridge/server lifecycle tests**

```powershell
npx vitest run packages/server/test/bridge-server.test.ts packages/server/test/server-lifecycle.test.ts packages/server/test/mcp-server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit lifecycle wiring**

```powershell
git add packages/server/src/bridge/bridge-server.ts packages/server/src/index.ts packages/server/test/bridge-server.test.ts packages/server/test/server-lifecycle.test.ts packages/server/test/mcp-server.test.ts
git commit -m "feat(server): wire debugger lifecycle to owned runtime"
```

---

### Task 8: Add the real Godot 4.6.3 advanced-debugger integration gate

**Files:**
- Create: `fixtures/runtime-project/debug_target.gd`
- Modify: `fixtures/runtime-project/main.tscn`
- Modify: `tests/integration/helpers/runtime-harness.ts`
- Create: `tests/integration/runtime-debugger-advanced.test.ts`
- Modify: `scripts/run-integration.mjs`
- Modify: `package.json`

**Interfaces:**
- Dedicated runner: `npm run test:integration:debugger` -> `node scripts/run-integration.mjs --debugger` after root build.
- Requires Windows, `GODOT_RUNTIME_INTEGRATION=1`, and `GODOT_BIN` exactly like runtime integration.
- Harness launches the editor with unique loopback `--dap-port` and `--debug-server tcp://127.0.0.1:<port>` so the test does not depend on global default 6006/6007.

- [ ] **Step 1: Create a deterministic debugger fixture with known line markers**

Use named marker comments so tests can discover line numbers from source instead of hardcoding brittle line numbers:

```gdscript
extends Node

var health := 100
var inventory := [{"name":"wrench","stats":{"power":7,"tags":["metal","tool"]}}]
var _started := false

func _process(_delta: float) -> void:
    if _started or not FileAccess.file_exists("res://.godot-mcp/start-debug-flow"):
        return
    _started = true
    DirAccess.remove_absolute("res://.godot-mcp/start-debug-flow")
    start_debug_flow()

func start_debug_flow() -> void:
    var local_value := 42
    var nested := {"numbers":[1,2,3],"meta":{"active":true}}
    _level_one(local_value, nested) # MCP_BP_ENTRY

func _level_one(value: int, nested: Dictionary) -> void:
    var doubled := value * 2 # MCP_STEP_OVER
    _level_two(doubled, nested) # MCP_STEP_INTO

func _level_two(value: int, nested: Dictionary) -> void:
    var final_value := value + nested.numbers[0] # MCP_STEP_OUT
    print("DEBUG_FLOW:%d" % final_value)
```

Modify `main.tscn` deterministically: increment `load_steps`, add `res://debug_target.gd` as an external Script resource, and add a `DebugTarget` child node whose `script` is that resource. Do not open the script through ScriptEditor APIs. The filesystem marker invokes the flow exactly once and removes itself, so no fixed startup timer is needed.

- [ ] **Step 2: Add deterministic port allocation to `runtimeHarness`**

Add a helper that binds a temporary Node TCP server on `127.0.0.1:0`, records the chosen port, closes it, and allocates two distinct ports. Extend the harness options with `manualBreakpoint?:boolean`; when enabled, patch the copied addon `plugin.gd` after `initProject()` with a fixture-only `_process` hook that watches `res://.godot-mcp/manual-breakpoint.json` and calls `_debugger.get_sessions()[*].set_breakpoint(path,line,enabled)` directly, never `set_mcp_breakpoint()`. A second marker `res://.godot-mcp/dump-breakpoints` writes `EditorInterface.get_script_editor().get_breakpoints()` to `res://.godot-mcp/breakpoints.json`. This gives the real test a breakpoint that is demonstrably outside MCP ownership and a way to inspect editor truth after MCP cleanup.

Launch Godot editor with:

```ts
['--editor','--dap-port',String(dapPort),'--debug-server',`tcp://127.0.0.1:${debugPort}`,'--path',root,'res://main.tscn']
```

Return `{dapPort,debugPort}` from the harness for diagnostics only; MCP tools never accept them.

The fixture-only `plugin.gd` hook injected by `runtimeHarness({manualBreakpoint:true})` must use the editor debugger session directly and keep its files under `.godot-mcp`:

```gdscript
func _process(_delta: float) -> void:
    if _debugger == null:
        return

    var manual_marker := "res://.godot-mcp/manual-breakpoint.json"
    if FileAccess.file_exists(manual_marker):
        var file := FileAccess.open(manual_marker, FileAccess.READ)
        var payload = JSON.parse_string(file.get_as_text()) if file != null else null
        DirAccess.remove_absolute(ProjectSettings.globalize_path(manual_marker))
        if typeof(payload) == TYPE_DICTIONARY:
            var path := str(payload.get("script_path", ""))
            var line := int(payload.get("line", 0))
            var enabled := bool(payload.get("enabled", true))
            for session in _debugger.get_sessions():
                session.set_breakpoint(path, line, enabled)

    var dump_marker := "res://.godot-mcp/dump-breakpoints"
    if FileAccess.file_exists(dump_marker):
        DirAccess.remove_absolute(ProjectSettings.globalize_path(dump_marker))
        var out := FileAccess.open("res://.godot-mcp/breakpoints.json", FileAccess.WRITE)
        if out != null:
            out.store_string(JSON.stringify(EditorInterface.get_script_editor().get_breakpoints()))
```

The harness creates `res://.godot-mcp` before writing either marker. This hook is inserted only into the copied integration fixture and is never committed into the production addon source.

- [ ] **Step 3: Add a failing dedicated integration test for breakpoint hit, stack, variables, expand, step-over, stale refs, and continue**

The test sequence must call only public MCP tools for debugger behavior. Fixture triggering may use the harness filesystem marker, but no private debugger RPC is allowed. Define debugger error precedence so an owned running runtime with an attached/ready debugger returns `RUNTIME_NOT_BREAKED` from `debug.stack`, while an owned runtime whose debugger transport is not ready returns `DEBUGGER_UNAVAILABLE`. The test can therefore condition-poll `debug.stack` for `RUNTIME_NOT_BREAKED`, write the fixture trigger marker, and then wait for the real break:

```text
debug.breakpoint.set(entry marker)
project.run
poll debug.stack -> RUNTIME_NOT_BREAKED (transport ready, execution still running)
write res://.godot-mcp/start-debug-flow fixture marker
wait runtime.status.state === breaked
debug.stack -> top frame path/line matches marker
debug.variables(frame_id) -> local_value=42 and nested expandable
debug.expand(variable_ref) -> numbers/meta visible
debug.step_over -> accepted
wait new breakId
old frame_id -> STALE_DEBUG_REFERENCE
debug.stack -> new valid frame
debug.continue -> accepted
```

Use condition polling (`waitFor`) instead of fixed sleeps.

- [ ] **Step 4: Run the dedicated test and capture the first real failure**

On the authoritative Windows machine:

```powershell
$env:GODOT_BIN="C:\Users\ramir\Desktop\Godot_v4.6.3-stable_win64.exe"
$env:GODOT_RUNTIME_INTEGRATION="1"
npx vitest run tests/integration/runtime-debugger-advanced.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected at this stage: either PASS or one concrete integration mismatch. If it fails, stop implementation changes, inspect the first assertion/adapter error and DAP traffic, identify root cause, then add the smallest regression test before changing code.

- [ ] **Step 5: Add real `step_into` and `step_out` flows**

Use the marker lines above so a `step_into` at `_level_two(...)` proves the new top frame is `_level_two`, then `step_out` proves the next stop returns to `_level_one`. Do not satisfy this gate with fake transport tests.

- [ ] **Step 6: Add restart/reapply and unopened-script gate**

Keep `debug_target.gd` unopened in Script Editor. Set a breakpoint there, run and hit it, stop/restart the runtime, and prove the same MCP-owned breakpoint hits again without another `debug.breakpoint.set` call.

This empirically covers the historical unopened-script compatibility concern on Godot 4.6.3.

- [ ] **Step 7: Add manual breakpoint preservation gate**

Use `runtimeHarness({manualBreakpoint:true})` and two distinct marker lines in `debug_target.gd`. The automated sequence is:

```text
debug.breakpoint.set(MCP-owned line B at MCP_STEP_OUT)
project.run
poll debug.stack until RUNTIME_NOT_BREAKED
write manual-breakpoint.json for line A at MCP_BP_ENTRY through the fixture-only editor helper
write start-debug-flow marker
manual A causes the first break on the MCP-owned runtime
debug.stack / debug.variables / debug.continue succeed
wait for a second break at MCP-owned B
close MCP client while breaked so normal server shutdown runs DebuggerService.close() then RuntimeService.stop()
wait until runtime is stopped and bridge disconnects
write dump-breakpoints marker while Godot editor remains alive
read breakpoints.json
manual A is still present
MCP-owned B is absent
```

Expose harness teardown in two phases (`closeClient()` and `closeEditor()`) so the test can inspect editor breakpoint state after MCP server cleanup but before terminating Godot. If this fixture-only direct `EditorDebuggerSession.set_breakpoint()` path is empirically indistinguishable from MCP ownership on Godot 4.6.3, stop, document the root cause, retain the strong service/addon tests, and move only this physical-origin subcase to the already-approved external Inspector validation; do not weaken the invariant.

- [ ] **Step 8: Add `--debugger` integration runner selection and root script**

In `scripts/run-integration.mjs`:

```ts
const debuggerGate=process.argv.includes('--debugger');
```

Treat it like runtime: Windows + `GODOT_RUNTIME_INTEGRATION=1` required. Select only `tests/integration/runtime-debugger-advanced.test.ts` for this flag.

In root `package.json` add:

```json
"test:integration:debugger": "npm run build && node scripts/run-integration.mjs --debugger"
```

Ensure the default general integration excludes the advanced debugger test so it does not unexpectedly require runtime integration environment variables.

- [ ] **Step 9: Run the dedicated Phase 9 gate until green under root-cause discipline**

```powershell
$env:GODOT_BIN="C:\Users\ramir\Desktop\Godot_v4.6.3-stable_win64.exe"
$env:GODOT_RUNTIME_INTEGRATION="1"
npm run test:integration:debugger
```

Expected: debugger integration file PASS with real Godot 4.6.3.

- [ ] **Step 10: Commit the real debugger gate**

```powershell
git add fixtures/runtime-project tests/integration/helpers/runtime-harness.ts tests/integration/runtime-debugger-advanced.test.ts scripts/run-integration.mjs package.json
git commit -m "test(integration): gate advanced debugger on Godot 4.6.3"
```

---

### Task 9: Document Phase 9 and run every authoritative regression gate

**Files:**
- Modify: `docs/tools/runtime-debugger.md`
- Modify: `docs/testing/runtime-validation.md`
- Modify: `README.md` only if the existing capability summary already lists phase/runtime tool families; otherwise leave README unchanged.
- No production-code change is allowed in this task unless a failing gate triggers a separate root-cause/TDD fix commit.

**Interfaces:**
- Documentation names all ten new tools, ownership rules, 1-based paths/lines, opaque reference lifetime, no-eval/no-mutation boundary, and dedicated integration command.
- Validation record uses actual observed counts/results; do not pre-fill green numbers that have not been run on Windows.

- [ ] **Step 1: Update runtime debugger documentation**

Document the public workflow:

```text
debug.breakpoint.set
project.run
runtime.status -> breaked
debug.stack
debug.variables
debug.expand
debug.step_over / step_into / step_out / continue
debug.breakpoint.remove
```

Explicitly document:

```text
manual breakpoints are never owned/removed by MCP
frame_id and variable_ref die after execution resumes or context changes
runtime.* inspection still returns RUNTIME_BREAKED while native debugger is stopped
no eval, setVariable, conditional breakpoints, raw DAP, remote attach
```

- [ ] **Step 2: Record the dedicated test command without claiming unrun evidence**

In `docs/testing/runtime-validation.md`, add the Phase 9 gate command and expected invariants. Only after the Windows run, append exact file/test counts and PASS evidence from the actual console output.

- [ ] **Step 3: Run generated-contract/build/typecheck/unit gates**

```powershell
npm run check:tool-contracts
npm run build
npm run typecheck
npm test
npm run check:godot
```

Expected:

```text
contracts: 183 tools current
build: PASS
typecheck: PASS
protocol/server/CLI tests: PASS
GDScript check: PASS
```

Record actual counts rather than copying expected counts into the validation document.

- [ ] **Step 4: Run general integration gate**

```powershell
$env:GODOT_BIN="C:\Users\ramir\Desktop\Godot_v4.6.3-stable_win64.exe"
npm run test:integration
```

Expected: all files selected by the default runner PASS. The current baseline default selection excludes only `visual-capture.test.ts`, `runtime-debugger.test.ts`, `runtime-game-capture.test.ts`, and `workflow-run-check.test.ts`; Task 8 adds `runtime-debugger-advanced.test.ts` to that exclusion list. Therefore the existing `headless-process-manager.test.ts` remains part of the general integration gate as it is in Phase 8.

- [ ] **Step 5: Run runtime integration regression**

```powershell
$env:GODOT_RUNTIME_INTEGRATION="1"
npm run test:integration:runtime
```

Expected: all pre-existing runtime ownership/pause/break/diagnostic/workflow tests PASS unchanged.

- [ ] **Step 6: Run visual integration regression**

```powershell
$env:GODOT_VISUAL_INTEGRATION="1"
npm run test:integration:visual
```

Expected: existing visual integration PASS.

- [ ] **Step 7: Run Phase 8 dedicated headless regression**

```powershell
node .\scripts\run-integration.mjs --headless
```

Expected: real headless lifecycle PASS, including ownership/editor-isolation regression. `HEADLESS_BUSY` behavior must remain covered by its existing automated tests.

- [ ] **Step 8: Run the Phase 9 dedicated debugger gate again from the final tree**

```powershell
$env:GODOT_RUNTIME_INTEGRATION="1"
npm run test:integration:debugger
```

Expected: real breakpoint/stack/variables/lazy expansion/continue/step/restart/unopened-script gate PASS.

- [ ] **Step 9: Inspect repository cleanliness and authoritative tree**

```powershell
git status --short
git show -s --format=%T HEAD
```

Expected: no uncommitted generated/test artifacts before the final documentation evidence commit.

- [ ] **Step 10: Commit documentation/evidence only after fresh gates are known**

```powershell
git add docs/tools/runtime-debugger.md docs/testing/runtime-validation.md README.md
git commit -m "docs: record Phase 9 debugger validation"
```

If `README.md` was unchanged, omit it from `git add`.

- [ ] **Step 11: Produce patch and bundle artifacts from the exact approved baseline**

From the final Phase 9 repository:

```powershell
git format-patch --stdout 28eb6c628a63399c4963f59a00a44a7b88d7beaf..HEAD > godot-mcp-phase9-advanced-debugging.patch
git bundle create godot-mcp-advanced-debugging-phase9.bundle dfe36900364acb47cb86c1eb14ab457aad7f3875..HEAD
```

If the implementation starts from a rebased local copy of the approved design commit, use the exact equivalent design tree as the patch baseline and record it. Tree identity, not local commit metadata, is authoritative.

- [ ] **Step 12: Simulate `git am --keep-cr` against the exact Phase 8 + approved-design baseline and compare trees**

Create a clean throwaway clone from the exact Phase 8 v2 bundle, then apply the already-approved design patch first and verify its known tree before applying the implementation patch:

```powershell
git clone .\godot-mcp-headless-process-manager-phase8-v2.bundle .\phase9-am-sim
cd .\phase9-am-sim
git am --keep-cr ..\godot-mcp-phase9-advanced-debugging-design.patch
git show -s --format=%T HEAD
# must equal 8bfb3dba5272897cdad8e575fff1420db42b1d48

git am --keep-cr ..\godot-mcp-phase9-advanced-debugging.patch
git show -s --format=%T HEAD
git status --short
```

Compare the final applied tree to the final implementation tree. Expected: exact tree hash match and empty `git status --short`. A differing commit hash with identical tree is acceptable because `git am` metadata can differ.

- [ ] **Step 13: Compute SHA-256 for final artifacts**

```powershell
Get-FileHash .\godot-mcp-phase9-advanced-debugging.patch -Algorithm SHA256
Get-FileHash .\godot-mcp-advanced-debugging-phase9.bundle -Algorithm SHA256
```

Record both hashes in the final handoff.

- [ ] **Step 14: Perform external MCP Inspector validation only after authoritative automated gates are green**

Use the approved external sequence from the spec:

```text
set MCP breakpoint -> run -> breaked -> stack -> variables -> expand -> step_over -> new stack -> continue -> remove -> clean state
manual breakpoint -> break -> MCP inspect/control -> cleanup -> manual breakpoint remains
```

This is additional evidence, not a substitute for the Windows/Godot 4.6.3 automated gates.

---

## Final Expected Commit Shape

The exact hashes are not predetermined. Keep this incremental commit sequence unless a root-cause regression fix requires an additional immediately-adjacent fix commit:

```text
feat(protocol): define advanced debugger contracts
feat(addon): add owned breakpoint debugger boundary
feat(server): add bounded Godot DAP transport
feat(server): scope debugger references by generation
feat(server): add session-owned debugger service
feat(mcp): expose canonical advanced debugger tools
feat(server): wire debugger lifecycle to owned runtime
test(integration): gate advanced debugger on Godot 4.6.3
docs: record Phase 9 debugger validation
```

A regression discovered during implementation gets its own minimal TDD fix commit immediately after the commit that exposed it; do not squash away evidence while Phase 9 is still being validated.

## Completion Checklist

Before calling Phase 9 `CLOSED GREEN`, verify all of these from fresh evidence:

```text
183 tool contracts current
39 canonical / 144 legacy
runtime profile 48 / full 183
build + typecheck + all unit tests
Godot 4.6.3 addon parse/check
previous general/runtime/visual/headless gates
real MCP-owned breakpoint hit
stack + frame mapping
variables + bounded lazy expansion
continue
step_into
step_over
step_out
stale reference rejection
DEBUG_CONTROL_BUSY race rejection
external runtime rejection
manual breakpoint collision rejection
manual breakpoint preservation on cleanup
manual removal wins over MCP desired state
runtime restart breakpoint reapply
DAP failure leaves runtime alive/stoppable
unopened-script breakpoint empirical PASS on 4.6.3
final active runtime clean
final MCP-owned breakpoint registry clean on session close
patch/bundle `git am --keep-cr` tree match
external Inspector validation PASS as additional evidence
```
