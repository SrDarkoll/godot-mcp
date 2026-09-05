# Godot MCP Transactions, Risk & Recovery Implementation Plan

> **Security mechanism superseded:** the original replayable confirmation-token design in this historical plan was replaced by MCP host/user `input_required` elicitation with HMAC-protected request state. See `docs/tools/security.md` and the hardening plan.


> **For agentic workers:** Use superpowers:executing-plans and TDD. Execute inline. Preserve the uncommitted Plans 3–4; no stage, commit, push or merge without a separate request.

**Goal:** Change a saved scene and script, detect invalid GDScript, restore both byte-for-byte, and retain usable snapshots/checkpoints and an audit trail.

**Architecture:** A Node recovery service stages declared file changes, journals publication, validates through Godot and compensates failed atomic changes. A shared MCP registrar enforces session permissions, risk confirmations and operation coordination. Checkpoints contain selected on-disk files and remain separate from visual checkpoints.

**Tech Stack:** Existing TypeScript/Zod/MCP/workspaces and Godot 4.6.3/GDScript on Windows; node:fs and crypto, no Git dependency for recovery.

## Execution record — 2026-09-05

The scoped milestone is implemented and remains uncommitted. See [validation evidence](../../testing/recovery-validation.md).

- [x] Project-scoped contracts, checked paths and exact-byte snapshots.
- [x] Staging, preview, validated commit and automatic compensation.
- [x] Persistent journal, restart recovery and outside-edit refusal.
- [x] File checkpoints, including a before-restore snapshot.
- [x] Session permissions and bound single-use risk confirmations.
- [x] Shared guarded registrar, mutation audit and operation coordination.
- [x] Native Godot preflight/validation and explicitly confirmed scene close.
- [x] Unit, integration, runtime/visual regression and syntax verification.

Safety refinements from implementation: all scene tabs must be closed for publication because selected files can have shared dependencies. Forced recovery is explicit (`force:true`), confirmation-bound and saves a checkpoint of current conflicting bytes first. Known forbidden reflective calls remain non-confirmable. Closing/reloading binds confirmation to the active editor root/history version. Shutdown waits for a writer before closing services; failed journals remain instead of being silently erased. The original task breakdown below is retained as planning context.

## Scope and honest boundaries

Transactions in this milestone operate on declared files, not arbitrary reflective editor method calls. Ordinary node tools retain their existing native Undo/Redo. They cannot run inside an open file transaction; no claim that separate editor history entries become one native undo action.

Godot's public EditorUndoRedoManager does not expose a reliable universal dirty-state query. To avoid discarding user edits, affected scene/script/resource editors must be closed before publication/restoration. A new `editor.close_scene` operation has explicit risk confirmation because Godot can discard unsaved edits. Recovery never automatically closes or saves user tabs. Creation of disk checkpoints is clearly identified as disk-only, not unsaved UI state.

Use the approved specification sections 29–39. Native references: [EditorUndoRedoManager](https://docs.godotengine.org/en/4.6/classes/class_editorundoredomanager.html), [ScriptEditor](https://docs.godotengine.org/en/4.6/classes/class_scripteditor.html), [ScriptEditorBase](https://docs.godotengine.org/en/4.6/classes/class_scripteditorbase.html). The Node coordinator protects this server's MCP operations; external tools, project scripts and human edits are detected where possible through fingerprints, not sandboxed.

## Public surface

- `transaction.begin({label,paths,atomic:true})` snapshots declared existing/missing files; only one open transaction.
- `transaction.write_file({transaction_id,path,content})` and `transaction.delete_file({transaction_id,path})` stage changes without touching working files.
- `transaction.preview({transaction_id})` reports actions, before/after hashes, sizes, risks and recoverability without writing project files.
- `transaction.commit({transaction_id,confirmation?})` publishes under a write lock, validates changed files and automatically compensates invalid atomic changes. Nonatomic mode is excluded from this first safe surface.
- `transaction.rollback({transaction_id})` cancels staged work. Published failure recovery uses `transaction.recover({session_id,transaction_id,confirmation?})`, retaining all snapshots.
- `transaction.status({transaction_id?,session_id?})` exposes journal state, paths and validation; default returns current active transaction.
- `checkpoint.create({label,paths})`, `checkpoint.list({session_id?})`, `checkpoint.inspect({checkpoint_id,session_id?})`, `checkpoint.restore({checkpoint_id,session_id?,confirmation?})` provide file snapshots. Restore first creates its own undo snapshot/journal.
- `permissions.status`, `permissions.set({permission,enabled,confirmation?})`, enable/disable aliases, and `risk.preview({tool,arguments})`.

All paths must be explicit `res://` files within the project. Reject traversal, Windows device/ADS paths, links, directories and protected `.git`, `.godot`, `.godot-mcp`, `.codex`, `.agents`, and the MCP addon itself. Limit 64 paths, 16 MiB/file and 128 MiB/snapshot. Text staging is limited to 4 MiB UTF-8; snapshots can preserve binary bytes. No recursive deletion or implicit project-wide snapshot.

Native validation initially supports `.gd`, `.tscn`, `.tres`; JSON can be validated in Node. Other transaction content types return `VALIDATION_UNAVAILABLE` before publication. Checkpoint restore is exact-byte recovery, not a new compilation claim. Restoring `project.godot` requires the editor to be disconnected. No runtime may be active during editor-connected publication/restoration.

## State, storage and conflicts

States: `open → applying → committed`, `applying → rolling_back → rolled_back`, and `recovery_required` on unresolved errors. Cancelling an unmodified open transaction becomes `rolled_back` without changing working files.

Persist under `.godot-mcp/sessions/<session>/transactions/<UUID>/`: `before/`, `after/`, `transaction.json`. Checkpoints use `checkpoints/<UUID>/before/` and `checkpoint.json`. File identities are indexed numeric blobs, never user paths as snapshot filenames. Each record includes path, existence, length and SHA-256.

Before publishing, compare every working-file fingerprint with its snapshot. An unexpected change yields `RECOVERY_CONFLICT` before any write. Writes use same-directory temporary files, fsync/close and rename; deletions remove only explicit regular files. Record publication intent before each replacement. On failure, restore only when current bytes equal recorded before or intended after bytes; refuse to overwrite third-party changes.

Multi-file publication is compensating recovery, not an OS-level multi-file atomic transaction. A persistent project journal at `.godot-mcp/runtime/recovery.json` blocks further mutations after a crash or failed compensation. Explicit recover checks the journal, snapshot hashes and workspace fingerprints. Never automatically erase an unresolved journal, snapshots or screenshots. A missing-file snapshot means remove only the file created by this transaction; directories are retained.

## Permissions and confirmation

Defaults match the master spec: filesystem.project/process.godot/network.local/editor.modify/runtime.modify true; filesystem.external/process.shell/process.external/network.external false. Settings live only in the service instance and reset on a new MCP session. Enabling a permission does not invent a missing shell/network tool or bypass the project-scope guard.

Read-only tools are allowlisted; unknown calls are conservative mutations. Normal saved-scene edits and undoable node changes remain normal. Reflective object calls, destructive reload/close, resource overwrite, script-create overwrite, project settings changes, transaction publication, checkpoint restore and enabling dangerous permissions require confirmation.

Risky calls first return `CONFIRMATION_REQUIRED` with a single-use, five-minute token bound to tool, canonical arguments, session and affected-file fingerprints. The client must explicitly resubmit that operation with `confirmation`. Changed arguments, stale files, expired/reused tokens fail. Previews/audit do not copy script content, tokens or raw return payloads; retain hashes, targets, risk and outcomes. Confirmation authorizes the operation's compensation within its declared scope, not arbitrary later changes.

All registered tool handlers share the policy wrapper. During an open file transaction, unrelated mutations/runs are refused. Publication/restoration holds an exclusive operation lock; project reads cannot observe an in-progress batch. Runtime stop/status and local status queries keep a control lane so Plan 4 stop cannot deadlock behind a long run. Operational writes are audited before execution and after completion; denied/risky requests are recorded without leaking confirmation tokens.

## File map

| Files | Responsibility |
|---|---|
| `packages/protocol/src/recovery.ts`, `security.ts`, `index.ts`, `session-artifacts.ts` | Schemas and discriminated file checkpoints |
| `packages/server/src/recovery/project-files.ts`, `snapshot-store.ts`, `recovery-service.ts` | Scope, snapshots, journal and lifecycle |
| `packages/server/src/security/tool-policy.ts`, `tool-registrar.ts`, `operation-gate.ts` | Permissions, confirmation, audit, coordination |
| `packages/server/src/tools/recovery-tools.ts`, `security-tools.ts` | Public MCP handlers |
| `packages/server/src/mcp/create-server.ts`, `tool-result.ts`, `bridge/rpc-router.ts`, `index.ts` | Shared services and structured error details |
| `packages/server/src/tools/runtime-tools.ts`, `debug-tools.ts` | Accept the common guarded registrar |
| `packages/godot-addon/addons/godot_mcp/bridge/handlers/recovery_handlers.gd`, `rpc_dispatcher.gd` | Closed-editor preflight, native file validation and close-scene API |
| `packages/protocol/test/recovery.test.ts`, `security.test.ts` | Contract bounds |
| `packages/server/test/recovery.test.ts`, `tool-policy.test.ts` | Exact bytes, conflicts, disk failures, tokens and locks |
| `tests/integration/recovery.test.ts` | Real scene/script validation and rollback |
| `docs/tools/transactions-recovery.md`, `docs/testing/recovery-validation.md` | Workflow, guarantees and evidence |

## Incremental TDD tasks

### 1. Contracts and scope

- [ ] Write tests rejecting `res://../x`, ADS/device names, protected directories, duplicates and oversized staging. Check old visual checkpoints still parse alongside file checkpoints.
- [ ] Run focused protocol tests and observe failures; implement schemas/exports; rerun to green.
- [ ] Implement checked path traversal one component at a time using lstat, rejecting links before access. Tests use real temporary files/junctions and verify no outside write.

### 2. Exact snapshots

- [ ] Test existing, missing, binary and empty files. Assert independently calculated hashes and byte-for-byte restore after edits, plus corruption rejection.
- [ ] Run server recovery tests red; implement exclusive numeric snapshot blobs and atomic JSON indexes; run green.
- [ ] Test a third-party edit before restore. Preflight must reject the entire batch without changing any file. Never delete snapshots during tests.

### 3. Transactions and crash journal

- [ ] Test staging does not modify originals; a fake validator rejects a deliberately invalid script and both actual working files return to exact before bytes.
- [ ] Test success, cancellation, disk failure after the first publication, and restart/recover from a retained journal. Implement the lifecycle after red tests.
- [ ] Require all before/after hashes and journal identities to validate before recovery. Missing/corrupt evidence produces `RECOVERY_REQUIRED`, not success or automatic cleanup.

### 4. Native preflight/validation

- [ ] In a real Godot fixture, assert recovery rejects an open affected scene. Close only the test scene through explicit close-scene operation.
- [ ] Implement `recovery.prepare` and `recovery.validate`: supported APIs and project-scoped fixed parameters only. GDScript validates via a fresh script with a resource path for relative references; scene/resource loads bypass stale cache.
- [ ] Publish scene/script changes and reject invalid syntax; verify original disk hashes and reopening the restored scene. Do not claim restoration of unsaved editor buffers.

### 5. Permissions and risk

- [ ] Test safe defaults, session reset, disabled editor mutation and unknown permission rejection.
- [ ] Test confirmation bound to method/arguments/fingerprints, expiry and single use. A changed script or target invalidates the token.
- [ ] Implement risk classifications with concrete targets and persist audit/permission changes. Risk preview must be read-only.

### 6. Shared registrar and coordination

- [ ] Test through real in-memory MCP transport: a denied operation never reaches its handler; normal existing reads still work; a confirmed risky action runs once.
- [ ] Use a wrapper over the public registerTool API, not private SDK internals. Add optional confirmation only at the boundary and remove it before handler dispatch.
- [ ] Test a held publication blocks project reads and an open transaction rejects unrelated writes. Preserve the runtime control lane and verify Plan 4 stop/capture cancellation.

### 7. Recoverable checkpoints

- [ ] Test checkpoint create/list/inspect across sessions, restore with confirmation, before-restore snapshots and untouched unrelated files.
- [ ] Store file checkpoints in the same session manifest using `kind:'files'`; visual checkpoints retain `kind:'visual'` and screenshot references.
- [ ] Restore never deletes additional files outside its declared set or rewrites protected metadata. Editor-connected restore uses the same preflight as transactions.

### 8. Integration and final review

- [ ] Add real integration: scene + script → begin → stage → preview/confirm → invalid commit → automatic rollback → exact hashes → reopen/inspect scene; then successful commit and checkpoint restore.
- [ ] Update old integration clients to explicitly acknowledge only expected risk prompts on their own fixtures; do not disable risk to make regressions pass.
- [ ] Run `rtk npm run build`, `rtk npm run typecheck`, `rtk npm test`, `rtk npm run check:godot`, mandatory base integration, visual integration and runtime integration serially.
- [ ] Inspect retained transaction/checkpoint/audit records, document any native fixture diagnostics and confirm only pre-existing personal Godot processes remain. Keep the branch/worktree and all local changes intact.

## Acceptance

Success means exact-byte compensation of a real failed two-file operation, successful validated publication, persistent recoverable checkpoints, enforced session permissions/risk confirmation and no regression of editor/runtime/capture tools. It does not mean isolation from arbitrary local programs, unsaved editor snapshotting or a full project-wide transactional database.
