# Godot MCP Phase 8 — True Headless / Process Manager Design

**Status:** Approved design, pending implementation plan  
**Date:** 2026-09-06  
**Baseline:** Phase 7.1 `d3fa897f1b4c74a349e082f5e86da1e80d99e84d`  
**Baseline tree:** `03bd5a49cd6bebd4fb8987eeed3078647364727a`

## Goal

Add a true server-side Godot headless execution surface that works when no Godot editor bridge is connected, without weakening the existing editor/runtime lifecycle or opening arbitrary shell/process execution.

Phase 8 introduces a dedicated `HeadlessProcessManager` and eight public `headless.*` tools. The manager may launch only the configured Godot executable, always against the current MCP session's fixed project root, with arguments constructed by the server from structured inputs.

## Non-goals

Phase 8 does not:

- replace or change the semantics of `project.run`, `project.run_scene`, `runtime.*`, `debug.*`, or the editor debugger bridge;
- execute `cmd.exe`, PowerShell, Bash, Python, npm, pytest, dotnet, GUT/GdUnit wrappers, or any other arbitrary executable;
- accept a raw command string, raw executable path, arbitrary cwd, or user-supplied raw Godot argv;
- provide arbitrary GDScript execution as a general-purpose escape hatch;
- claim debugger-grade runtime inspection, readiness, stepping, breakpoints, or game capture for a headless child;
- promise safe cross-session reattachment to an OS process after an ungraceful MCP server crash.

External test runners can be designed later as a separate, explicitly permissioned subsystem.

## Existing architecture and compatibility boundary

The Phase 7.1 runtime path is editor-owned:

```text
MCP tool
  -> RuntimeService
  -> BridgeServer RPC
  -> Godot EditorPlugin / EditorDebuggerPlugin
  -> EditorInterface play lifecycle
  -> running game debugger channel
```

That path is already externally validated and remains unchanged.

Phase 8 adds a parallel path:

```text
MCP tool
  -> HeadlessProcessManager
  -> configured godotBin ONLY
  -> server-constructed Godot argv
  -> project
```

`HeadlessProcessManager` is server-side and does not depend on `BridgeServer.connected`, `editorConnected`, `RuntimeService`, or `EditorInterface`.

## Public tool surface

Phase 8 adds exactly eight tools:

```text
headless.validate_project
headless.import
headless.run
headless.run_scene
headless.run_tests
headless.status
headless.stop
headless.get_output
```

All eight are new canonical typed bindings from their first release. The total public tool count becomes **173**, with **29 canonical** and **144 legacy** bindings.

The tools belong to a new `headless` tool domain and are exposed in the `runtime` and `full` profiles only.

Expected profile counts after Phase 8:

```text
minimal       5
core         78
2d          121
3d          107
navigation   67
ui           81
runtime      38
full        173
```

No existing profile loses or changes an existing tool.

## Godot executable resolution

The server resolves the Godot executable once for the session using:

1. `.godot-mcp/config.json` `godotBin`, if non-null;
2. otherwise `GODOT_BIN`, if non-empty;
3. otherwise no headless executable is available.

A missing, inaccessible, non-file, or failed spawn is reported as a structured headless error. The MCP server still starts and non-headless tools remain available.

The manager never accepts a Godot executable path from an MCP tool argument.

## Child-process isolation

Every child launched by `HeadlessProcessManager` receives:

```text
GODOT_MCP_HEADLESS_CHILD=1
```

The installed Godot `EditorPlugin` checks this marker at `_enter_tree()` and skips only the MCP editor bridge/debugger setup for marked headless children.

This prevents `--editor` headless jobs from competing for the live MCP bridge descriptor or being mistaken for the user's graphical editor. It does not disable the plugin in project settings, modify `project.godot`, delete descriptors, or change normal editor behavior.

The existing runtime autoload already disables itself when `Engine.is_editor_hint()` is true or `EngineDebugger` is inactive, so Phase 8 does not add a second headless runtime/debugger channel.

## Execution model

Each MCP session owns at most **one active Godot child execution at a time**, regardless of execution kind.

Starting any execution while another execution is in `starting`, `running`, or `stopping` returns:

```text
HEADLESS_BUSY
```

The following remain callable while an execution is active:

- `headless.status`
- `headless.get_output`
- `headless.stop`

Execution identity is an MCP-generated UUID `executionId`. An OS PID may be recorded as diagnostic metadata, but it is never the public ownership identity and must not be accepted as a tool target.

### Execution states

```text
starting -> running -> exited
                  \-> stopping -> exited
starting ---------------------> failed
running ----------------------> failed
```

For bounded jobs, `running` means the process has spawned and has not exited yet. For persistent runs, `running` means only that the Godot child process is alive; it does **not** claim that a scene completed `_ready()` or that gameplay is semantically ready.

## Bounded jobs

### `headless.validate_project`

Input:

```text
{ timeout_ms?: integer }
```

Default timeout: 60,000 ms. Maximum: 600,000 ms.

Server-constructed argv:

```text
--headless --path <projectRoot> --editor --quit
```

Semantics: validate that Godot can initialize the project in headless editor mode and exit. This is an initialization/startup validation, not a promise that every possible script path or runtime behavior is correct.

### `headless.import`

Input:

```text
{ timeout_ms?: integer }
```

Default timeout: 180,000 ms. Maximum: 600,000 ms.

Server-constructed argv:

```text
--headless --path <projectRoot> --import
```

The operation may update Godot's project-local import/cache state under `.godot/`; this is one reason it is approval-gated.

### `headless.run_tests`

Input:

```text
{
  script_path: "res://tests/example.gd",
  timeout_ms?: integer
}
```

Default timeout: 120,000 ms. Maximum: 600,000 ms.

`script_path` must:

- start with `res://`;
- end in `.gd`;
- contain no `..`, backslash, NUL, drive/URI colon after `res://`, or repeated `//`;
- resolve to an existing regular file inside the fixed project root;
- not be a symlink or escape the project through a linked parent.

Server-constructed argv:

```text
--headless --path <projectRoot> --script <validated res:// script_path>
```

The test script is expected to be a Godot command-line script suitable for `--script` (for example a `SceneTree`/`MainLoop` test entry point that exits with an explicit code). Phase 8 does not adapt arbitrary testing frameworks and does not execute external runners.

## Persistent runs

### `headless.run`

Input:

```text
{}
```

Server-constructed argv:

```text
--headless --path <projectRoot>
```

Runs the project's configured main scene. The tool returns after successful process spawn with a `running` execution record unless the process has already exited.

### `headless.run_scene`

Input:

```text
{ scene_path: "res://levels/example.tscn" }
```

`scene_path` uses the existing safe Godot scene-path rules and must resolve to an existing regular project file without symlink escape.

Server-constructed argv:

```text
--headless --path <projectRoot> <scene_path>
```

No raw engine arguments are accepted.

## Observation and control

### `headless.status`

Read-only. Returns:

- whether a usable Godot binary is configured;
- current active execution, if any;
- last execution in this session, if any.

It does not require an editor bridge and must remain usable when `editorConnected=false`.

### `headless.get_output`

Read-only and session-scoped.

Input:

```text
{
  execution_id?: UUID,
  after?: non-negative integer,
  limit?: 1..200
}
```

If `execution_id` is omitted, use the active execution or most recent execution. An execution from another session is rejected.

Output is a bounded ordered page of captured stdout/stderr chunks with monotonically increasing sequence numbers, plus `nextCursor`, `truncated`, final `exitCode` when known, and execution state.

### `headless.stop`

Approval-gated. Accepts no PID or execution ID; it stops only the active child owned by the current manager/session.

Stop behavior:

1. transition `running/starting -> stopping`;
2. request normal child termination;
3. wait a short fixed grace period;
4. force-kill only that owned child if it does not exit;
5. finalize state and persisted metadata.

If no current-session child is active, return an idempotent `stopped:false` result rather than touching unrelated Godot processes.

## Output bounding and persistence

Each execution gets a bounded session artifact log under:

```text
logs/headless/<executionId>.jsonl
```

The log contains ordered stdout/stderr records. The manager records at most **512 KiB** of UTF-8 output payload per execution. Once the cap is reached:

- the child continues running;
- additional process output is drained but not persisted;
- the execution record sets `outputTruncated=true`.

This prevents child-process pipe backpressure while keeping session artifacts bounded.

The manager retains at most the latest **20 headless execution records** in the session manifest. When adding execution 21, only completed historical records may be evicted; the active record is never evicted. Corresponding bounded log artifacts may remain on disk as session evidence even if their manifest record is no longer in the 20-entry index.

## Session manifest

`SessionManifestSchema` gains a backward-compatible defaulted `headlessRuns` array. Existing manifests without the field remain readable.

Each record contains at least:

```text
executionId
kind
state
startedAt
endedAt
exitCode
signal
pid
scenePath | scriptPath
logPath
outputBytes
outputTruncated
timedOut
stoppedByRequest
```

The active execution is derived from the manager plus the latest nonterminal record; there is no second independently mutable `activeHeadless` truth.

## Graceful shutdown and crash semantics

Normal MCP shutdown calls `HeadlessProcessManager.close()` before final session completion. The manager stops only its own active child, finalizes its execution record, flushes output, and then allows the session manifest to be marked ended.

An ungraceful server crash can leave a child process alive at the OS level. Phase 8 records enough manifest evidence to identify the previous execution as unfinished, but it **does not automatically kill or reattach to a PID from a previous server lifetime** because PID reuse makes that unsafe without a verifiable cross-process identity channel.

On the next server start, unfinished records from older sessions are historical stale evidence, not current ownership. Current-session `headless.stop` never targets them. Full verified orphan reclamation is deferred rather than pretending a PID alone proves ownership.

This is a deliberate safety refinement of the earlier design discussion: fail closed on unverifiable cross-session process ownership.

## Security and permissions

### Allowed capability

All headless process-starting/control tools require:

```text
filesystem.project
process.godot
```

They never require or enable:

```text
filesystem.external
process.shell
process.external
network.external
```

They also do not require `editor.modify`, `runtime.modify`, or `network.local` merely to launch the server-side Godot child.

### Risk classification

Normal/read-only:

```text
headless.status
headless.get_output
```

Risky/approval-gated:

```text
headless.validate_project
headless.import
headless.run
headless.run_scene
headless.run_tests
headless.stop
```

Risky tools must use the existing MCP elicitation/fingerprint/replay protection. No Phase 8-specific approval bypass is introduced.

Approval assessments are bound to meaningful targets:

- `headless.run_scene` fingerprints its validated `scene_path`;
- `headless.run_tests` fingerprints its validated `script_path`;
- `headless.validate_project`, `headless.import`, and `headless.run` include `res://project.godot` as the project execution target;
- `headless.stop` uses dynamic assessment state containing the current `executionId`, so approval elicited for one child cannot later stop a different child if the active execution changes before acceptance. Its contract uses `risk.dynamic = "conditional"`.

If `process.godot` or `filesystem.project` is disabled, process-starting/control operations are blocked with `PERMISSION_DENIED` before spawn.

### Recovery barrier interaction

`headless.status`, `headless.get_output`, and `headless.stop` remain available during recovery/transaction barriers so an already-owned process can always be observed or stopped.

Starting `validate_project`, `import`, `run`, `run_scene`, or `run_tests` requires the normal recovery barrier to be clear. This prevents launching Godot against a project known to require recovery.

A merely open staging transaction is also treated as a start conflict by policy; observation/stop remain available.

## Structured errors

Phase 8 uses stable MCP error codes for at least:

```text
HEADLESS_GODOT_UNAVAILABLE
HEADLESS_BUSY
HEADLESS_EXECUTION_NOT_FOUND
HEADLESS_INVALID_TARGET
HEADLESS_SPAWN_FAILED
HEADLESS_STOP_FAILED
HEADLESS_OUTPUT_FAILED
```

Bounded-job nonzero Godot exits are returned as completed execution results with `state=exited` and their exact `exitCode`; they are not transport failures. Spawn/management failures use structured MCP errors.

A timeout finalizes the execution with `state=failed`, `timedOut=true`, and `errorCode="HEADLESS_TIMEOUT"`, stops the owned child, and returns that completed execution result rather than leaving the process active. `HEADLESS_TIMEOUT` is therefore an execution-record error code, not an MCP transport error.

## Canonical contracts and generated artifacts

All eight tools are added to `scripts/tool-contracts.json` as canonical bindings. Each contract names its exact input schema identifier and handler identifier.

The existing generator continues to own:

- `packages/server/src/tooling/tool-catalog.generated.ts`
- `packages/server/src/security/tool-policy.generated.ts`
- `docs/generated/tool-inventory.md`

The generator expected tool count changes from 165 to 173. No hand-edit of generated artifacts is allowed.

## File/module boundaries

Phase 8 should add focused units rather than enlarging `RuntimeService`:

```text
packages/protocol/src/headless.ts
  schemas and public headless result types

packages/server/src/headless/headless-paths.ts
  project-local res:// target validation/resolution

packages/server/src/headless/headless-output-store.ts
  bounded JSONL output persistence and pagination

packages/server/src/headless/headless-process-manager.ts
  one-child ownership, spawn/stop/timeout/state/manifest lifecycle

packages/server/src/tools/headless-tools.ts
  canonical context-first handler functions

packages/server/src/mcp/register-headless-tools.ts
  eight typed canonical bindings
```

Existing files receive only integration changes: protocol exports/domain, server construction/shutdown, tool policy, manifest schema/store initialization, addon child marker, contract manifest, tests, and docs.

`RuntimeService` remains editor/debugger-owned and does not absorb headless process state.

## Testing strategy

### Unit/protocol tests

Tests must prove:

1. new schemas reject raw executable/cwd/argv concepts because those fields do not exist;
2. `scene_path` and `script_path` reject traversal, backslashes, external/absolute paths, wrong extensions, NULs, and linked-file escape;
3. process arguments are constructed only from fixed templates and validated targets;
4. only one execution may be active;
5. status/output/stop remain callable while active;
6. bounded jobs apply defaults and the 600,000 ms maximum;
7. timeout stops/finalizes the child;
8. 512 KiB output cap sets truncation while continuing to drain output;
9. output pagination is deterministic and session-scoped;
10. graceful manager close stops only the owned child;
11. old manifests without `headlessRuns` still parse;
12. new execution records persist deterministically;
13. `process.godot=false` blocks spawn/control without requiring `process.shell` or `process.external`;
14. all six process/control tools are risky and both read tools are normal;
15. canonical direct-registration bypass remains rejected for the new tools;
16. profile counts are exactly `5/78/121/107/67/81/38/173`.

### Godot integration tests

Using the authoritative Windows Godot 4.6.3 binary, integration coverage must prove:

1. `headless.validate_project` succeeds with the graphical editor closed;
2. `headless.import` succeeds and exits;
3. a `SceneTree` test script under `res://` returns a known exit code/output through `headless.run_tests`;
4. `headless.run` starts the fixture main scene without an editor bridge;
5. `headless.run_scene` starts an explicit fixture scene;
6. `headless.status` reports the owned process while alive;
7. `headless.get_output` returns known fixture output;
8. `headless.stop` terminates the owned process and no second process can start concurrently;
9. headless `--editor` jobs do not authenticate as the live MCP editor bridge because `GODOT_MCP_HEADLESS_CHILD=1` suppresses the addon bridge;
10. existing standard editor, runtime debugger, visual capture, recovery, profile, contract, and Phase 7.1 tests remain green.

### External-client validation

After local Windows gates pass, validate with MCP Inspector because all six process-starting/control tools are risky and require elicitation. Antigravity may be used for the two read tools, but its known lack of MCP elicitation is a client limitation and must not cause security weakening.

A final smoke should demonstrate that the server can start, validate/import/run a fixture with the graphical editor closed, retrieve output, stop its owned process, and finish with no active headless execution.

## Acceptance criteria

Phase 8 is GREEN only when all of the following are true:

- exactly eight `headless.*` tools exist and are typed canonical bindings;
- total/profile counts are exactly `173` total and `5/78/121/107/67/81/38/173` by profile order;
- no tool can choose an executable, cwd, shell command, or raw argv;
- only the configured Godot binary is spawned;
- scene/test targets are project-local `res://` files with symlink-safe resolution;
- one-child-per-session ownership and `HEADLESS_BUSY` are deterministic;
- bounded jobs time out and clean up without orphaning the owned child;
- persistent runs can be observed, read, and stopped without an editor connection;
- output persistence is bounded to 512 KiB per execution and pagination works;
- normal shutdown stops only the current session-owned child;
- stale previous-session PID evidence is never treated as verified ownership;
- headless editor jobs do not connect to the normal MCP editor bridge;
- `process.shell`, `process.external`, `filesystem.external`, and `network.external` remain disabled by default and unnecessary for Phase 8;
- existing editor/runtime/recovery/security behavior and all prior Windows gates remain green;
- incremental patch transport reproduces the final implementation tree exactly from the Phase 7.1 baseline.
