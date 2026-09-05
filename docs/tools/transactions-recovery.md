# File transactions, checkpoints and session policy

Plan 5 adds recoverable operations on explicitly declared project files. It does not snapshot unsaved editor buffers or combine arbitrary node operations into a native UndoRedo action. Existing editor tools retain their native Undo/Redo outside a file transaction.

## Safe workflow

Save any edits you intend to keep and close scene tabs before beginning. For scripts/resources, close their affected script tabs or resource inspector as well. The preflight deliberately requires no open scene tabs because other scenes may share dependencies; it does not guess which unsaved edits are safe to discard. `editor.close_scene` is a separate, confirmed operation and can discard unsaved changes. Recovery never automatically saves or closes tabs.

Begin with paths and a label:

```json
{"label":"Update player","paths":["res://main.tscn","res://player.gd"],"atomic":true}
```

Use the returned ID with `transaction.write_file`:

```json
{"transaction_id":"<UUID>","path":"res://player.gd","content":"extends Node2D\nvar speed := 120\n"}
```

Staging does not change working files. `transaction.delete_file` stages removal of an explicit declared file. `transaction.preview` reports create/modify/delete actions, sizes and before/after hashes. `transaction.rollback` cancels an open staging transaction without changing working files.

Call `transaction.commit` with `{"transaction_id":"<UUID>"}`. Risky operations enter MCP's native `input_required`/elicitation flow. The MCP host presents the operation to the user and retries the same call only after approval; the model does not receive a replayable confirmation token. Publication compares current file fingerprints, saves publication intent, replaces files, validates and either commits or restores the before bytes. Invalid validation returns `isError: true` with transaction state `rolled_back` and its validation errors. Query `transaction.status` after an uncertain response rather than blindly repeating changes.

One file transaction may be open per server. Unrelated mutations and game launches are refused until it is committed/cancelled. Project reads cannot pass a publication writer. Runtime stop/status keep a separate control lane so stopping a game does not wait behind a capture. A running game prevents recovery publication; stop it explicitly first.

Native validation covers declared surviving `.gd`, `.tscn` and `.tres` files through the connected editor. JSON validation is Node-local. Other staged types or missing native validation return `VALIDATION_UNAVAILABLE` before publishing. Validation is not an exhaustive project dependency/security audit, and project script loading is not OS-sandboxed.

## Exact files and persistent journals

Snapshots preserve bytes, including empty/binary files and whether a file was absent. Limits are 64 paths, 16 MiB per file, 128 MiB per snapshot, and 4 MiB per staged UTF-8 text write. Paths must be explicit ordinary `res://` files. Traversal, Windows ADS/device names, links, directories and protected Git/Godot/MCP/agent metadata are rejected. Snapshots of the MCP addon itself are excluded.

```text
.godot-mcp/sessions/<session>/transactions/<id>/
  before/<blob>.bin
  after/<blob>.bin
  transaction.json

.godot-mcp/runtime/recovery.json
```

Blobs use generated names and SHA-256; user paths are metadata only. There is no recursive deletion. A missing-before entry removes only the explicit file created by the operation; created directories are retained. No snapshots or screenshots are cleaned automatically.

The project journal is written before publication. This provides compensating recovery, not an OS-level atomic transaction spanning files. A crash or unsuccessful compensation leaves the journal in place and blocks normal project operations. `transaction.status` without an ID reports the active transaction or journal identity.

Recover a journal with its recorded session and transaction IDs:

```json
{"session_id":"<original-session>","transaction_id":"<UUID>","force":false}
```

`transaction.recover` requires confirmation. Default recovery refuses a file that matches neither its before nor intended after fingerprint, preserving an outside edit. To deliberately replace a conflict, use `force:true` and review its separate confirmation. Forced recovery first creates a file checkpoint of the current bytes; if that backup cannot be saved, it does not restore over them. Corrupt/missing snapshot evidence is not bypassed by force.

These checks coordinate this server's MCP requests and detect ordinary outside edits. They are not isolation from another process racing filesystem changes. When the editor bridge is unavailable, restoration is file-only and cannot inspect an unconnected editor's unsaved state. Restoring `project.godot` requires the editor bridge to be disconnected and the project to be reopened afterward.

## Recoverable checkpoints

`checkpoint.create({label,paths})` captures selected on-disk files. It does not include unsaved UI changes or automatically expand to the whole project. `checkpoint.list` and `checkpoint.inspect` accept an optional prior `session_id` from the same project.

`checkpoint.restore({checkpoint_id,session_id?})` requires confirmation, preflights the editor, snapshots the current files into a restore transaction and applies the checkpoint bytes. Unrelated files remain untouched. Restoration is exact-byte recovery, not a fresh compilation guarantee for every binary format.

File checkpoints have `kind: "files"`; earlier visual checkpoints have `kind: "visual"` and only reference images. They coexist in `session.manifest`. A visual checkpoint cannot restore project files.

## Permissions and risk

`permissions.status` reports tool permissions. `permissions.set({permission,enabled})` and enable/disable aliases update the current session only; a new server session resets defaults:

| Permission | Default |
|---|---|
| filesystem.project, process.godot, network.local, editor.modify, runtime.modify | true |
| filesystem.external, process.shell, process.external, network.external | false |

Permissions govern the advertised tool surface. They do not sandbox project scripts, create missing shell/network endpoints or remove the fixed project-path boundary. Stop and local status operations remain available for safe control. Enabling dangerous permissions requires confirmation; disabling/restricting a permission does not.

`risk.preview({tool,arguments})` reports risk and targets without execution. Risky operations include reflective calls, reload/close, project settings changes, existing-resource overwrite, publication and restoration. Known forbidden reflective methods such as `free` remain blocked with `SAFETY_VIOLATION`; confirmation cannot enable them.

A risky attempt returns an MCP `input_required` result containing a boolean elicitation request. Its `requestState` is HMAC-signed by the MCP SDK, expires after five minutes, and carries the tool plus the current operation fingerprint. The fingerprint includes the session, canonical arguments and relevant file/editor state. Changed arguments or files invalidate the prior approval and require a new review. The local MCP host is trusted to surface elicitation to the human operator.

Every operational mutation records intent/outcome in `logs/audit.jsonl`. Permission changes also appear in the manifest. Audit entries contain targets, risk, argument hashes and transaction linkage, not raw script contents or approval state secrets. Snapshot blobs intentionally contain original/staged file bytes and may contain sensitive project data; they remain local.

## Scope of this milestone

Verified on Windows/Godot 4.6.3. Git is not used for snapshots or rollback. Recovery of unsaved editor state, grouping arbitrary editor calls, full project dependency validation, adversarial multiprocess isolation and a cleanup/release CLI are separate work. If publication or its final audit fails, inspect the retained state before deciding whether to retry, cancel or recover.
