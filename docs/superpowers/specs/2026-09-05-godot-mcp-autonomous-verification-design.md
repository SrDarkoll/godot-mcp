# Godot MCP Autonomous Verification Workflow Design

## Goal

Give Codex a deterministic, low-call-count verification loop on top of the already verified editor, runtime, diagnostics, visual-capture, recovery, and session-artifact primitives.

The MCP remains an execution/observation layer. It does not embed an LLM, decide how to fix a game, or execute arbitrary GDScript. Codex remains responsible for interpretation and edits.

## Public workflow tools

### `workflow.snapshot`

Persist a compact baseline under `.godot-mcp/sessions/<session>/artifacts/workflow/<uuid>.json` and return it.

Input:
- `label`: 1-80 chars, default `workflow_snapshot`.
- `capture`: `none | game | editor_2d | editor_3d`, default `none`.
- `viewport_index`: 0-3, used only for `editor_3d`, default 0.
- `checkpoint`: whether a requested visual capture also creates a visual checkpoint, default true.
- `diagnostic_limit`: 1-200 recent diagnostic entries to include, default 100.

Snapshot contents:
- immutable snapshot id, session id, label, timestamp;
- active edited scene when the editor is connected;
- current runtime status;
- current diagnostic cursor, bounded recent entries, and total output/warning/error counts for the current run when native diagnostics are available;
- optional persisted screenshot metadata;
- manifest cursors/counts needed for later deltas: next screenshot sequence, error count, transaction count, checkpoint count, runtime-run count.

A requested capture is explicit. `game` requires an owned connected graphical runtime; editor captures require the graphical editor. Capture failure fails `workflow.snapshot` rather than silently producing an incomplete requested snapshot.

### `workflow.run_check`

Provide the primary `modify -> run -> inspect -> see` primitive.

Input:
- `target`: `main | current | path`, default `current`;
- `path`: required only for `target=path` and validated as `res://...(.tscn|.scn)`;
- `label`: 1-80 chars, default `run_check`;
- `capture`: boolean, default true;
- `checkpoint`: boolean, default true;
- `settle_ms`: 0-5000, default 500;
- `diagnostic_limit`: 1-200, default 100;
- `include_performance`: boolean, default true.

Behavior:
1. Read runtime state.
2. If an active runtime is session-owned, stop it before launching the requested target.
3. If an active runtime is external/manual, fail with the existing ownership error; never stop or replace it.
4. Start a fresh session-owned run.
5. Wait the bounded settle interval.
6. Collect runtime status, bounded native diagnostics, and performance metrics when supported.
7. If requested and supported, capture the game viewport and persist it/checkpoint it.
8. Persist a workflow snapshot for this observation.
9. Return a deterministic verdict plus all observation metadata. When a game image exists, include that image in MCP content so Codex can inspect pixels in the same tool call.

Verdict rules:
- `fail`: runtime is failed/stopped/disconnected unexpectedly, or at least one native diagnostic entry is `error`.
- `inconclusive`: runtime is debugger-breaked, a requested capture could not be produced, or a requested supported observation fails without a native runtime error.
- `pass`: runtime is running/paused, no error diagnostic is present, and every requested observation completed. Warnings are returned but do not fail the check.

`workflow.run_check` leaves the owned runtime running/paused so existing runtime tools can inspect it further. `project.stop` / `runtime.stop` remain the explicit stop mechanism.

### `workflow.diff_since`

Compare current state with a persisted workflow snapshot.

Input:
- `snapshot_id`: UUID;
- `diagnostic_limit`: 1-200, default 100.

Return:
- baseline id/timestamp;
- active scene before/after and whether it changed;
- runtime before/after, run-id/state changes;
- new diagnostics after the baseline cursor when the run is unchanged, or bounded diagnostics from the new run when it changed;
- screenshots created since the baseline sequence;
- new manifest error records, transactions, checkpoints, and runtime-run records since baseline counts;
- truncation/dropped information from diagnostics.

`workflow.diff_since` is read-only and does not create a new snapshot or screenshot.

## Storage and safety

Workflow snapshots use the existing session directory validation and remain project-scoped. Snapshot file names are server-generated UUIDs; callers never provide filesystem paths. Writes are create-only and reject symlinks/hard links/overwrite.

The workflow layer composes existing services instead of bypassing them:
- runtime ownership stays enforced by `RuntimeService`;
- captures stay validated/persisted by `VisualTools` / `ScreenshotStore`;
- diagnostics stay bounded by `DiagnosticStore`;
- all public workflow tools pass through the existing `ToolPolicy`/audit registrar.

Risk classification:
- `workflow.snapshot`: normal local/project artifact mutation because it persists a workflow artifact and may explicitly capture.
- `workflow.run_check`: normal runtime mutation, equivalent in power to the already-normal `project.run` + visual capture sequence; requires runtime/process/project permissions.
- `workflow.diff_since`: read-only.

No workflow tool may approve risky operations, alter permission state, call arbitrary reflective methods, restore checkpoints, or modify project files.

## Failure handling

The workflow service distinguishes expected observation failures from hard safety/ownership failures. Safety, permission, ownership, session-closed, invalid-request, and artifact-integrity errors propagate as MCP errors. `run_check` may convert a capture/performance observation failure into an `inconclusive` result only after the runtime has started successfully, preserving the structured error code/message in `observationErrors`.

## Testing

Unit tests must prove:
- workflow snapshot files are persistent, UUID-addressed, bounded, and cannot be read outside the current session;
- diff cursors return only changes after the baseline;
- `run_check` stops only a session-owned active run and never an external run;
- verdict rules for errors, warnings, debugger break, and observation failure;
- a requested capture is returned as image content by the MCP registration layer;
- tool policy grants the same bounded permissions as the composed underlying operations.

Real Godot integration must exercise:
1. launch a fixture scene with runtime output/warning and a visible frame;
2. call `workflow.run_check` and verify owned runtime, diagnostics, screenshot persistence, snapshot persistence, and pass verdict;
3. modify or trigger an observable runtime change, call `workflow.diff_since`, and verify only post-baseline changes;
4. run a fixture that emits a native error and verify `fail` with retained evidence;
5. verify manual/external runtime ownership is never replaced.

## Non-goals

This milestone does not add TileMap, animation, shader, navigation, UI-layout, or physics-specific authoring tools. It does not implement automatic fixes, screenshot interpretation inside the server, arbitrary shell execution, or cross-project orchestration.
