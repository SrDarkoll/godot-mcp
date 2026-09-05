# Autonomous verification workflow

The workflow tools combine existing Godot MCP primitives into a deterministic verification loop. They do not interpret screenshots or edit the project themselves; the MCP returns evidence and the calling agent decides what to change.

## Recommended loop

```text
edit
  -> workflow.run_check
  -> inspect verdict + diagnostics + image
  -> edit
  -> workflow.run_check
  -> workflow.diff_since
```

## `workflow.run_check`

Use this after a meaningful edit when you want one call to start a fresh owned run, collect native diagnostics/performance, and capture the running game.

```json
{
  "target": "current",
  "capture": true,
  "checkpoint": true,
  "settle_ms": 500,
  "diagnostic_limit": 100,
  "include_performance": true,
  "label": "after_player_fix"
}
```

The result contains `pass`, `fail`, or `inconclusive`, the runtime status, bounded native diagnostics, optional performance metrics, the persisted workflow snapshot, and screenshot metadata. When capture succeeds, the same MCP response also contains the PNG image so a vision-capable agent can inspect it immediately.

`fail` means the runtime failed/stopped/disconnected unexpectedly or native diagnostics contained an error. Warnings remain visible but do not fail the check. `inconclusive` means the debugger is breaked or a requested observation such as game capture could not be completed.

If a runtime is already running and belongs to the current MCP session, `workflow.run_check` stops that owned run and launches a fresh one. If the active runtime was launched manually/outside the MCP session, the tool returns `RUNTIME_NOT_OWNED` and does not stop or replace it.

## `workflow.snapshot`

Use this when you need a stable comparison baseline without restarting the game.

```json
{
  "label": "before_ui_change",
  "capture": "editor_2d",
  "checkpoint": true,
  "diagnostic_limit": 100
}
```

`capture` can be `none`, `game`, `editor_2d`, or `editor_3d`. Snapshots are immutable server-generated JSON artifacts stored below the current session's `artifacts/workflow/` directory.

## `workflow.diff_since`

Use the snapshot UUID returned by either `workflow.snapshot` or `workflow.run_check`:

```json
{
  "snapshot_id": "123e4567-e89b-42d3-a456-426614174000",
  "diagnostic_limit": 100
}
```

The result includes active-scene changes, runtime/run-id changes, diagnostics after the baseline cursor, screenshots created since the baseline sequence, and newly appended session errors/checkpoints/transactions/runtime-run records.

## Safety boundary

Workflow tools are orchestration only. They do not:

- approve risky operations;
- change permission state;
- restore checkpoints;
- call arbitrary reflective methods;
- execute shell commands;
- apply automatic fixes;
- replace an external/manual Godot runtime.

All underlying runtime ownership, screenshot validation, session artifact, audit, and permission checks remain in the existing services.
