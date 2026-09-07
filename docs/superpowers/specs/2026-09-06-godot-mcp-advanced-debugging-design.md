# Godot MCP Phase 9 — Advanced Debugging Design

**Status:** Approved design, pending implementation plan
**Date:** 2026-09-06
**Baseline bundle HEAD:** `dfe36900364acb47cb86c1eb14ab457aad7f3875`
**Authoritative baseline tree:** `3b66e0eb3b21c82f49e79ec2987d37957782cf33`

## Goal

Add debugger-grade breakpoints, stack inspection, frame variables, lazy complex-value expansion, continue, and source-level stepping for the Godot runtime already owned by the MCP session.

Phase 9 introduces a dedicated `DebuggerService` and a separate `debug.*` control lane for the debugger-breaked state. Runtime lifecycle authority remains in `RuntimeService`; Phase 9 does not replace, duplicate, or weaken the existing editor/runtime or Phase 8 headless ownership models.

## Scope decisions

Phase 9 is intentionally focused:

- breakpoints are simple `res://*.gd + line` breakpoints;
- MCP-created breakpoints are owned by the MCP session;
- MCP never removes or mutates a breakpoint it does not own;
- if the runtime itself is session-owned, MCP may inspect and continue/step a break caused by either an MCP breakpoint or a manual user breakpoint;
- ordinary `runtime.*` inspection remains blocked while the debugger is `breaked`;
- a separate `debug.*` lane handles stack, variables, expansion, continue, and stepping;
- frame/object inspection is read-only;
- complex values use bounded lazy expansion through opaque references;
- debugger transport is local-only and internally selected; MCP callers cannot choose a host, port, process, adapter executable, or raw debugger message.

## Non-goals

Phase 9 does not add:

- conditional breakpoints;
- hit counts;
- logpoints;
- expression evaluation;
- arbitrary function invocation;
- variable mutation or DAP `setVariable`-style operations;
- profiler redesign or continuous tracing;
- arbitrary DAP requests;
- remote DAP targets;
- attach to arbitrary or external Godot processes;
- changes to the existing semantics of `runtime.pause` / `runtime.resume`;
- changes to the existing diagnostic tools `debug.output`, `debug.errors`, `debug.warnings`, or `debug.performance`;
- debugger control for runtimes not owned by the MCP session;
- crash-safe rollback of MCP breakpoints after an ungraceful MCP server/editor process termination.

## Existing compatibility boundary

The existing runtime architecture remains authoritative for lifecycle:

```text
project.run / project.run_scene
        ↓
RuntimeService
        ↓
Godot editor bridge
        ↓
Editor debugger session
        ↓
running game
```

Today a native debugger break is represented as runtime state `breaked`. Normal runtime inspection/capture rejects that state with `RUNTIME_BREAKED`; status and stop remain available through their existing control path.

Phase 9 preserves those semantics and adds a parallel debugger-control path:

```text
MCP client
   │
   ├── runtime.* ───────────────────────→ RuntimeService
   │                                        │
   │                                        └── lifecycle authority
   │
   ├── debug.breakpoint.* ──────────────→ Godot addon debugger adapter
   │                                        │
   │                                        └── individual breakpoint apply/remove
   │
   └── debug.stack / variables / step_* → DebuggerService
                                            │
                                            ├── verifies RuntimeService ownership/runId
                                            └── local Godot DAP backend
```

`DebuggerService` is a debugger backend and state coordinator, not a second runtime lifecycle manager.

## Why the breakpoint path is separate from DAP

MCP breakpoint ownership must not interfere with breakpoints created manually in Godot.

The design therefore uses the addon/editor debugger adapter for **individual breakpoint apply/remove** and keeps a session-owned registry on the server. DAP is used for debugger-grade stopped-context operations such as stack, scopes/variables, continue, and stepping.

This hybrid boundary provides two invariants:

1. MCP can prove which breakpoints it owns and clean up only those entries.
2. DAP can provide debugger context without becoming the source of truth for breakpoint ownership.

## Public tool surface

Phase 9 adds exactly ten canonical tools:

```text
debug.breakpoint.set
debug.breakpoint.remove
debug.breakpoint.list
debug.stack
debug.variables
debug.expand
debug.continue
debug.step_into
debug.step_over
debug.step_out
```

All ten belong to the `debug` domain and appear in the `runtime` and `full` profiles only.

Expected public surface after Phase 9:

```text
183 tools total
39 canonical
144 legacy
```

Expected profile counts:

```text
minimal       5
core         78
2d          121
3d          107
navigation   67
ui           81
runtime      48
full        183
```

No existing tool is removed or renamed.

## Tool policy classification

Read-only:

```text
debug.breakpoint.list
debug.stack
debug.variables
debug.expand
```

Normal mutations:

```text
debug.breakpoint.set
debug.breakpoint.remove
debug.continue
debug.step_into
debug.step_over
debug.step_out
```

These operations are not `risky` and do not require MCP elicitation. They remain subject to normal permission checks. Runtime ownership is required for stack/variables/expand and execution control; breakpoint set/remove/list instead require the editor-connected breakpoint boundary described below.

The four debugger execution controls are **not** added to the privileged shutdown/control-tool set. `runtime.stop` remains the authoritative way to terminate a runtime during shutdown.

## Breakpoint contracts

All three breakpoint tools require the Godot editor bridge to be connected (`editorConnected=true`), but they do **not** require a running game. This keeps editor breakpoint state authoritative while still allowing breakpoints to be declared before `project.run`.

### `debug.breakpoint.set`

Input:

```json
{
  "script_path": "res://player.gd",
  "line": 42
}
```

Semantics:

- validate and normalize input before mutating editor state;
- if `(script_path, line)` is already MCP-owned, return idempotent success;
- inspect the editor breakpoint inventory before claiming a new location;
- if that location already exists but is not MCP-owned, return `BREAKPOINT_OWNERSHIP_CONFLICT` without mutation;
- otherwise add `(script_path, line)` to the session-owned desired breakpoint registry;
- apply the individual breakpoint to the current debugger session when possible;
- if no applicable debugger session exists yet, retain desired state and apply it when the matching session appears.

### `debug.breakpoint.remove`

Input:

```json
{
  "script_path": "res://player.gd",
  "line": 42
}
```

The operation is permitted only when `(script_path, line)` is present in the MCP session's owned registry.

If the breakpoint is not owned by MCP:

```text
BREAKPOINT_NOT_OWNED
```

No editor/debugger mutation occurs in that case.

### `debug.breakpoint.list`

Input:

```json
{}
```

Returns only breakpoints owned by the current MCP session:

```json
{
  "scope": "session_owned",
  "breakpoints": [
    {
      "scriptPath": "res://player.gd",
      "line": 42
    }
  ]
}
```

Phase 9 does not promise an inventory of manual/user breakpoints.

## Breakpoint path validation

Validation happens before ownership mutation or addon calls:

```text
schema
  ↓
normalize path
  ↓
project confinement
  ↓
extension check
  ↓
line validation
  ↓
ownership/policy
  ↓
addon apply/remove
```

Accepted breakpoint scripts must:

- begin with `res://`;
- end with `.gd`;
- resolve within the fixed project root;
- contain no `..`, backslash, NUL, drive/URI escape, or path traversal form accepted by the existing project-path defenses;
- target a **1-based public line number** `>= 1`.

All Phase 9 public source locations are 1-based. The addon/DAP adapters translate to any backend-native indexing internally; backend line-number conventions are never exposed through MCP contracts.

Phase 9 does not attempt to prove that a source line is executable before sending it to Godot.

## Breakpoint ownership and lifetime

The logical identity of a breakpoint is:

```text
(scriptPath, line)
```

The server keeps a small session-owned registry conceptually equivalent to:

```text
OwnedBreakpoint {
  scriptPath
  line
  desired: true
  appliedSessionId?: ...
}
```

The distinction between desired state and currently applied state is intentional.

Breakpoints survive runtime stop/restart **within the same MCP session** and are reapplied to a newly matching debugger session. Runtime lifecycle and breakpoint lifetime are separate concerns.

When the MCP session itself shuts down gracefully, it removes only breakpoints present in its owned registry. Manual breakpoints are never added to that registry and must survive MCP cleanup unchanged.

If the editor bridge is temporarily disconnected while the same MCP session remains alive, ownership state is retained and reconciled when the editor reconnects. If the MCP server or editor is terminated ungracefully before cleanup can run, Phase 9 does not claim crash-safe breakpoint rollback; that would require a persistent recovery subsystem outside this phase.

### Manual editor changes to an MCP-owned breakpoint

The addon observes editor breakpoint change/clear notifications. MCP-originated `set_breakpoint` calls use a narrow suppression/origin guard so their resulting editor notifications are not mistaken for user edits.

If the user manually disables/removes an MCP-owned breakpoint, or clears breakpoints from the editor UI, **the user's action wins**: the affected location is removed from the MCP owned/desired registry and is not silently recreated on the next runtime restart.

If a user breakpoint already occupies the same path/line before MCP attempts to set one, MCP returns `BREAKPOINT_OWNERSHIP_CONFLICT` and never claims that location. This same-location rule is required to make the promise “MCP only removes its own breakpoints” well-defined.

## Runtime ownership rule

All debugger execution/context operations require the current runtime to be owned by the MCP session.

Ownership of the **breakpoint** and ownership of the **runtime** are separate:

```text
manual breakpoint + session-owned runtime
→ stack/variables/continue/step allowed
→ breakpoint removal by MCP forbidden
```

For an external/manual runtime:

```text
RUNTIME_NOT_OWNED
```

The presence of a reachable debugger endpoint is never sufficient proof of ownership.

## DebuggerService state machine

`DebuggerService` has internal lifecycle state, but the state is not a new public runtime lifecycle API.

```text
DETACHED
   │
   │ session-owned runtime appears
   ▼
ATTACHING
   │
   │ local debugger handshake succeeds
   ▼
READY
   │
   │ stopped event
   ▼
BREAKED
   │
   ├── stack / variables / expand
   ├── continue
   └── step_*
   │
   ▼
RESUMING
   │
   │ continued event
   ▼
READY

runtime exit / stop / restart / session shutdown
   ↓
DETACHED
```

If debugger transport becomes unavailable while the runtime remains alive, the debugger layer becomes unavailable/degraded; it does not seize or terminate runtime lifecycle ownership.

## Local debugger transport

The debugger transport is local-only.

MCP tool arguments cannot provide:

```text
host
port
process id
adapter executable
raw debugger request/message
```

The server chooses the endpoint/configuration internally and accepts only a debugger session that is correlated to the current MCP-owned runtime generation.

Remote or arbitrary-process attach is outside Phase 9.

Initial debugger connection may use a bounded startup retry window to tolerate Godot startup ordering. Retries are finite; transport failure eventually becomes a structured debugger error.

## Runtime and break generations

Debugger data is scoped by two internal generations:

```text
runtimeGeneration
breakGeneration
```

`runtimeGeneration` changes whenever the owned runtime/runId changes.

`breakGeneration` changes whenever a new valid debugger stop context is established.

Every opaque frame or variable reference maps internally to both generations plus the corresponding backend identifier. Backend/DAP IDs are never treated as globally stable public IDs.

This prevents stale debugger context from one run or one stop from being reused in another.

## Break context and stack

On a valid debugger `stopped` event:

1. verify correlation with the current `runtimeGeneration`;
2. create a new `breakGeneration`;
3. record the active stopped thread/context;
4. establish a new opaque `breakId`;
5. expose stack/variables/control operations for that break.

### `debug.stack`

Input:

```json
{}
```

Example response shape:

```json
{
  "breakId": "<opaque UUID>",
  "frames": [
    {
      "frameId": "<opaque UUID>",
      "name": "_physics_process",
      "scriptPath": "res://player.gd",
      "line": 42,
      "column": 5
    }
  ]
}
```

`frameId` is MCP-generated/opaque and valid only for the current break context.

Phase 9 does not expose a public thread-selection API. The service uses the stopped thread/context reported for the current break.

## Variables and lazy expansion

### `debug.variables`

Input:

```json
{
  "frame_id": "<opaque UUID>"
}
```

Returns bounded scopes/variables for the selected current frame. Scope names are backend-derived and may include values such as locals, members, or globals when supported by Godot.

Simple values are represented inline:

```json
{
  "name": "health",
  "type": "int",
  "value": "75",
  "variableRef": null,
  "valueTruncated": false
}
```

Complex expandable values return an opaque `variableRef`:

```json
{
  "name": "inventory",
  "type": "Array",
  "value": "Array[12]",
  "variableRef": "<opaque UUID>",
  "valueTruncated": false
}
```

### `debug.expand`

Input:

```json
{
  "variable_ref": "<opaque UUID>",
  "start": 0,
  "limit": 100
}
```

Pagination rules:

```text
default limit = 100
maximum limit = 500
start >= 0
```

Complex values are expanded one level at a time. Nested expandable values receive their own opaque references.

There is no automatic deep recursive serialization.

Long textual representations are bounded and report truncation metadata rather than producing unbounded MCP responses.

## Reference invalidation

The following invalidate the current break context and all frame/variable references derived from it:

```text
debug.continue
debug.step_into
debug.step_over
debug.step_out
runtime.stop
runtime.restart
runtime exit/disconnect
new debugger stop context
session shutdown
```

Use of an opaque reference from an invalidated break returns:

```text
STALE_DEBUG_REFERENCE
```

References are revalidated before returning an asynchronous read result. If execution continued while a stack/variable request was in flight, the operation fails stale rather than returning potentially inconsistent data.

## Continue and stepping

Tools:

```text
debug.continue
debug.step_into
debug.step_over
debug.step_out
```

Input for all four:

```json
{}
```

Each operation requires:

```text
runtime ownership = session
runtime state     = breaked
current debugger context valid
```

`debug.continue` resumes normal execution.

`debug.step_into`, `debug.step_over`, and `debug.step_out` issue the corresponding source-level debugger action against the active stopped context and wait only for acceptance/control handoff; the next stop establishes a new `breakGeneration`.

A continued event immediately invalidates the old break context.

## Debug control concurrency

Only one execution-control operation may be in flight at a time:

```text
debug.continue
debug.step_into
debug.step_over
debug.step_out
```

A second overlapping control call fails explicitly:

```text
DEBUG_CONTROL_BUSY
```

Control calls are not silently queued. Silent queuing could cause an action such as `continue` to execute unexpectedly after a preceding step completes.

Read-only `debug.stack`, `debug.variables`, and `debug.expand` may overlap while they belong to the same valid `breakGeneration`.

## Stop and restart behavior

`runtime.stop` remains authoritative even when execution is debugger-breaked. The client is not required to `debug.continue` before stopping.

On stop/exit:

```text
invalidate current break context
close/detach debugger transport
preserve session-owned desired breakpoints
RuntimeService completes lifecycle ownership handling
```

On restart:

```text
old runtimeGeneration invalidated
old stack/variable refs invalidated
old debugger transport detached
new RuntimeService runId established
new debugger transport correlated/attached
session-owned desired breakpoints reapplied
```

Transient frame, variable, thread, step, or break context is never carried across a restart.

## Debugger transport failure

A debugger transport failure does not automatically stop the game.

When transport fails while a session-owned runtime remains alive:

- runtime ownership remains in `RuntimeService`;
- `runtime.stop` remains available;
- debugger-context tools fail closed with a structured error;
- stale frame/variable context is invalidated;
- the service does not attach to any alternate process merely because one is reachable.

## Error model

Phase 9 adds/uses structured errors so expected state failures are not collapsed into generic internal errors.

New debugger-specific errors:

```text
DEBUGGER_UNAVAILABLE
DEBUGGER_ATTACH_FAILED
DEBUG_CONTROL_BUSY
STALE_DEBUG_REFERENCE
DEBUG_FRAME_NOT_FOUND
DEBUG_VARIABLE_NOT_FOUND
BREAKPOINT_NOT_OWNED
BREAKPOINT_OWNERSHIP_CONFLICT
BREAKPOINT_INVALID_PATH
BREAKPOINT_INVALID_LINE
BREAKPOINT_APPLY_FAILED
DEBUG_PROTOCOL_ERROR
RUNTIME_NOT_BREAKED
```

Existing runtime/protocol errors remain authoritative where applicable, including:

```text
RUNTIME_NOT_OWNED
RUNTIME_NOT_CONNECTED
RUNTIME_BREAKED
INVALID_ARGUMENT
PERMISSION_DENIED
```

If implementation discovers that an existing canonical error already expresses one of the proposed new cases without loss of meaning, it should reuse the existing error instead of introducing a duplicate. Such a change must not weaken the fail-closed semantics described here.

## Fail-closed invariants

Ambiguous ownership or stale state always rejects the operation.

Examples:

```text
reachable debugger endpoint + mismatched runId
→ reject; never control
```

```text
known frameRef + changed breakGeneration
→ STALE_DEBUG_REFERENCE
```

```text
breakpoint exists in Godot + absent from MCP owned registry
→ BREAKPOINT_NOT_OWNED
→ no remove call

manual breakpoint already exists at requested MCP path/line
→ BREAKPOINT_OWNERSHIP_CONFLICT
→ do not claim or mutate it
```

```text
old debugger transport answers after runtime restart
→ ignore/reject through runtimeGeneration mismatch
```

## Security invariants

Phase 9 must preserve all existing process and project boundaries:

- no shell execution;
- no arbitrary executable;
- no arbitrary process attach;
- no user-selected DAP host/port;
- no raw debugger request forwarding;
- no `eval`;
- no variable mutation;
- no arbitrary filesystem path in breakpoint tools;
- no debugger control of external/manual runtimes;
- no adoption or deletion of manual/user breakpoints, including same-path/line collisions;
- bounded variable/output responses;
- session-scoped opaque references.

## TDD strategy

Implementation follows test-driven development. Production behavior is added only after a failing test demonstrates the required contract/invariant.

### Protocol and contract tests

Add failing tests first for all ten tools covering:

- valid schemas;
- strict unknown-field rejection;
- breakpoint path and line constraints;
- opaque UUID/reference fields;
- `start`/`limit` bounds;
- canonical metadata;
- policy classification;
- generated artifacts current;
- exact profile counts.

Expected surface:

```text
183 total
39 canonical
144 legacy
runtime 48
full 183
```

### DebuggerService unit tests

Use a deterministic fake debugger transport to cover:

- attach success/failure;
- stopped/continued/terminated/disconnect events;
- stack retrieval;
- scopes/variables;
- lazy expansion;
- continue;
- step over;
- step into;
- step out;
- runtimeGeneration correlation;
- breakGeneration invalidation;
- external-runtime rejection;
- overlapping control rejection;
- transport failure isolation.

Required regression examples include:

```text
break A
→ obtain frameRef A
→ continue
→ break B
→ use frameRef A
→ STALE_DEBUG_REFERENCE
```

and:

```text
step_over pending
+
continue
→ DEBUG_CONTROL_BUSY
```

and:

```text
debugger disconnect
→ runtime remains session-owned/alive
→ debug.* unavailable
→ runtime.stop still works
```

### Breakpoint ownership tests

Required automated tests:

```text
manual breakpoint exists
+
MCP breakpoint exists
+
MCP session cleanup
→ manual breakpoint survives
→ MCP breakpoint removed
```

and:

```text
remove(manual breakpoint)
→ BREAKPOINT_NOT_OWNED
→ manual breakpoint unchanged
```

and:

```text
manual breakpoint already exists at X
→ MCP set(X)
→ BREAKPOINT_OWNERSHIP_CONFLICT
→ manual breakpoint unchanged
→ X never enters MCP ownership registry
```

and:

```text
MCP owns breakpoint X
→ user manually removes X
→ MCP drops ownership/desired state for X
→ runtime restart does not recreate X
```

These are gate-level invariants, not incidental coverage.

## Real Godot 4.6.3 integration gate

Phase 9 adds a dedicated real-Godot integration gate, conceptually exposed as:

```powershell
node .\scripts\run-integration.mjs --debugger
```

The exact command name may follow the repository's integration-runner conventions, but Phase 9 must have one dedicated debugger gate that can be run independently.

A deterministic Godot fixture should expose known locals, members, a nested expandable value, and call depth sufficient to validate every stepping mode.

The primary real-debugger sequence must prove:

```text
editorConnected=true
        ↓
set MCP breakpoint
        ↓
project.run
        ↓
runtime running
        ↓
breakpoint hit
        ↓
runtime state=breaked
        ↓
debug.stack
        ↓
expected frame/path/line
        ↓
debug.variables
        ↓
expected local/member visible
        ↓
debug.expand
        ↓
nested value visible
        ↓
debug.step_over
        ↓
new stop context
        ↓
old frameRef rejected stale
        ↓
new stack valid
        ↓
debug.continue
        ↓
runtime resumes
```

Separate real flows must exercise `debug.step_into` and `debug.step_out`, not merely mock them.

## Manual-breakpoint preservation gate

The preferred real integration test establishes both a non-MCP/manual breakpoint and an MCP-owned breakpoint, then verifies session cleanup removes only the MCP breakpoint.

If Godot 4.6.3 public automation APIs cannot create a breakpoint that is meaningfully distinguishable as manual without contaminating ownership semantics, this requirement may be split into:

1. strong automated ownership tests at the addon/service boundary; and
2. external MCP Inspector validation with a breakpoint placed manually in the Godot UI.

The invariant itself is not optional.

## Breakpoint-in-unopened-script compatibility gate

The real Godot 4.6.3 gate must also set and hit an MCP breakpoint in a valid script that is not opened in the Script Editor before the run.

The result is treated as empirical compatibility evidence for the authoritative Godot 4.6.3 baseline; Phase 9 does not assume support until the gate passes.

## Regression gates

Phase 9 must rerun all authoritative existing gates in addition to the new debugger gate:

```text
contracts/codegen
build
typecheck
npm test
check:godot
general integration
runtime integration
visual integration
headless Phase 8 integration
debugger Phase 9 integration
```

No previous GREEN phase may be weakened to make Phase 9 pass.

Phase 8 invariants that remain explicitly protected include:

- headless process ownership;
- `HEADLESS_BUSY`;
- editor bridge isolation;
- owned-child shutdown;
- no killing of external/manual Godot processes.

## External client validation

After all authoritative Windows/Godot 4.6.3 gates are GREEN, perform an additional MCP Inspector validation:

```text
set breakpoint
→ run
→ breakpoint hit
→ stack
→ variables
→ expand
→ step_over
→ new stack
→ continue
→ remove MCP breakpoint
→ final clean state
```

A second external flow validates the manual-breakpoint rule:

```text
manual breakpoint hit on session-owned runtime
→ MCP stack/variables work
→ MCP continue/step works
→ MCP never removes manual breakpoint
→ manual breakpoint remains after MCP cleanup
```

External Inspector validation is additional evidence. The Windows/Godot 4.6.3 automated gates remain authoritative.

## Closure criteria

Phase 9 may be declared `CLOSED GREEN` only with fresh evidence for:

```text
contracts current
build/typecheck
unit tests
Godot 4.6.3 GDScript check
all previous integration gates
real breakpoint hit
stack
variables
lazy expansion
continue
step_into
step_over
step_out
stale-reference rejection
control-concurrency protection
MCP breakpoint ownership
manual breakpoint preservation
restart/reapply behavior
debugger transport failure isolation
breakpoint hit in unopened script
final clean state
```

After that, the optional/additional external record may be declared:

```text
Phase 9 External Client Validation
PASS
```

## Implementation constraints

Implementation must follow the existing repository patterns and Phase 9 approved process:

- root cause before fixes if any test or integration behavior is unexpected;
- TDD for production changes;
- incremental commits;
- minimum change required for each behavior;
- no unrelated refactors;
- generated contract/catalog/policy artifacts updated through the repository's canonical generation flow;
- Windows + Godot 4.6.3 gates are authoritative;
- no Phase 10 work is included.

## Design summary

Phase 9 adds a narrow debugger-grade layer without broadening execution authority:

```text
RuntimeService owns the game lifecycle.
DebuggerService owns only debugger context for that game.
The addon applies/removes only MCP-owned breakpoints.
DAP supplies stack/variables/continue/stepping for the correlated owned runtime.
Opaque refs die when execution context dies.
Manual breakpoints survive MCP cleanup.
External runtimes remain uncontrollable.
```

This boundary keeps the new debugger powerful enough for autonomous debugging while preserving the ownership and fail-closed rules established by earlier phases.
