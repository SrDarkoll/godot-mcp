# Security model

Godot MCP is intentionally powerful: it can mutate an open Godot project and, when enabled, control a runtime session. The security model therefore separates **permissions** from **risk approval**.

## Session permissions

Permissions are reset to their defaults every time the MCP server starts. Project filesystem access, the Godot process, loopback networking, editor mutation and runtime mutation are enabled for the normal workflow. External filesystem, arbitrary shell/process access and external networking are disabled by default.

Enabling a permission that is disabled by default is itself a risky operation and requires host/user approval. Permission changes are recorded in the session manifest and audit log.

## Routine project work

An enabled session permission is sufficient for ordinary bounded work; the server does not ask for an additional risk approval on every routine call:

- The six `headless` process tools validate/import/run local projects and scenes, run local GDScript tests, or stop the session-owned process. They require `filesystem.project` and `process.godot`, use controlled arguments, reject linked/out-of-project targets, and cannot stop an arbitrary PID. Project code is trusted, just as when running a game in the editor; this is not an operating-system sandbox.
- `project.settings.set` permits a bounded allowlist of plain values: project name, an existing ordinary project-local main scene, normal local autoloads or their removal, window dimensions, stretch configuration, canvas texture filter and 2D pixel snapping. The `GodotMcpRuntime` autoload and addon resources are excluded. Unknown keys, invalid values, unavailable/external/linked resources and other sensitive configuration still require risk approval.
- `editor.close_scene` saves the active named scene before closing it. A failed or unavailable save leaves the scene open; an unnamed scene returns `SCENE_SAVE_REQUIRED` so the caller can use `scene.save_as`. Only explicit `discard_changes: true` skips saving, and that option requires approval. No open scene is a harmless no-op. The server requires the addon's `safeCloseSupported` capability before default closing; an old addon returns `CAPABILITY_UNAVAILABLE` and is never sent a potentially destructive close command.

Disabled permissions still fail with `PERMISSION_DENIED`. Routine classification does not bypass recovery barriers, transaction locks, path validation, audit records or ownership checks. Overwriting existing files, restoring snapshots, undo/redo with unknown provenance and reflective calls remain guarded.

### Fresh script inspection

`script.inspect` with a GDScript `path` reads disk source and compiles a new isolated script, without replacing or reloading the cached live script. Godot's separate GDScript cache can reuse a live script even under ResourceLoader's ignore modes, so those modes alone are not sufficient. Deleted source returns `NOT_FOUND`; invalid source returns `SCRIPT_COMPILE_FAILED`, not old valid metadata. With `node_path`, it intentionally inspects the currently attached script instead. `inspection_source` identifies `disk`, `attached`, or `resource` (other languages/binary scripts use the engine's compiled resource, not fresh source compilation). Inspection does not publish code into live instances or save unsaved script-editor buffers. On engines without `Resource.set_path_cache`, a unique path in the same directory provides relative-path context; native verification for this repair targets Godot 4.6.3.

## Risky-operation approval

Risky tools use MCP's native input-required/elicitation flow. The server does **not** return a bearer confirmation token to the model.

For each approval request the server:

1. computes a SHA-256 fingerprint over the session, tool name, arguments, relevant on-disk file fingerprints and editor/recovery state;
2. seals the tool name, fingerprint and a random one-time nonce into MCP `requestState` with the SDK HMAC codec and a five-minute TTL; the codec is also bound to the active Godot MCP session and originating MCP method;
3. asks the MCP host to present a boolean approval to the user, including bounded/escaped targets and a bounded argument preview; large/sensitive payloads are represented by size/type plus a short SHA-256 digest instead of being dumped into the prompt;
4. on re-entry, verifies the signed/bound state and recomputes the current operation fingerprint;
5. consumes the approval nonce before execution, so an accepted approval cannot be replayed;
6. executes only when the user accepted and the current fingerprint still matches the approved operation.

If files or relevant editor state that the operation declares change while approval is pending, the old approval is stale and a new approval is required. Replaying a previously accepted approval fails with `APPROVAL_REPLAYED` and never re-executes the tool. Reflective `object.call` approvals bind the target, method and serialized arguments; they do not snapshot the implementation bytes of an attached user script, so project code remains inside the trusted project boundary.

A client that does not support MCP elicitation cannot execute risky operations through this flow; it fails closed. If the user declines or cancels an approval request, the tool does not execute and returns `APPROVAL_DECLINED` with structured details stating that execution did not occur, user approval is required, and the client should ask the user to approve through the MCP host before retrying.

## Reflective `object.call`

`object.call` is always classified as risky and therefore always requires host/user approval. It is not a sandbox for project code: an approved user-script method can perform whatever that Godot project is normally allowed to perform.

The MCP additionally blocks private methods and direct reflective/structural bypasses such as `free`, `queue_free`, `call`, `callv`, `set`, `set_script`, deferred call/set variants, RPC escape methods, and direct child/reparent mutations. Use the dedicated node/property/signal tools instead so safety policy, Undo/Redo and audit behavior remain visible.

`editor.undo` and `editor.redo` are also risky operations. Godot's active/global UndoRedo history can contain manual editor work, and the current bridge cannot prove that the next history entry was created by this MCP session. They therefore require host/user approval until action provenance is tracked explicitly.

## Trust boundary

The local MCP host is part of the trusted computing base. Elicitation is intended to be surfaced to a human operator. A host configured to auto-approve elicitation removes that human-approval guarantee.

The Risk Gate governs operations executed **through Godot MCP**. It is not a sandbox for other capabilities the host may give the agent. If the same agent can also edit files directly, launch processes, use a shell, or control Godot through another integration, those external capabilities can produce effects equivalent to a guarded MCP tool without passing through Godot MCP approval. Restrict those capabilities separately when the approval boundary matters.

Node ↔ Godot communication remains authenticated and bound to `127.0.0.1`. Project paths are scoped to the active project, and recovery/session metadata rejects symbolic-link traversal where it writes artifacts.
