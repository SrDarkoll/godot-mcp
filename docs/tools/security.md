# Security model

Godot MCP is intentionally powerful: it can mutate an open Godot project and, when enabled, control a runtime session. The security model therefore separates **permissions** from **risk approval**.

## Session permissions

Permissions are reset to their defaults every time the MCP server starts. Project filesystem access, the Godot process, loopback networking, editor mutation and runtime mutation are enabled for the normal workflow. External filesystem, arbitrary shell/process access and external networking are disabled by default.

Enabling a permission that is disabled by default is itself a risky operation and requires host/user approval. Permission changes are recorded in the session manifest and audit log.

## Risky-operation approval

Risky tools use MCP's native input-required/elicitation flow. The server does **not** return a bearer confirmation token to the model.

For each approval request the server:

1. computes a SHA-256 fingerprint over the session, tool name, arguments, relevant on-disk file fingerprints and editor/recovery state;
2. seals the tool name and fingerprint into MCP `requestState` with the SDK HMAC codec and a five-minute TTL;
3. asks the MCP host to present a boolean approval to the user;
4. on re-entry, verifies the signed state and recomputes the current operation fingerprint;
5. executes only when the user accepted and both fingerprints still match.

If files or relevant editor state that the operation declares change while approval is pending, the old approval is stale and a new approval is required. Reflective `object.call` approvals bind the target, method and serialized arguments; they do not snapshot the implementation bytes of an attached user script, so project code remains inside the trusted project boundary.

A client that does not support MCP elicitation cannot execute risky operations through this flow; it fails closed.

## Reflective `object.call`

`object.call` is always classified as risky and therefore always requires host/user approval. It is not a sandbox for project code: an approved user-script method can perform whatever that Godot project is normally allowed to perform.

The MCP additionally blocks private methods and direct reflective/structural bypasses such as `free`, `queue_free`, `call`, `callv`, `set`, `set_script`, deferred call/set variants, RPC escape methods, and direct child/reparent mutations. Use the dedicated node/property/signal tools instead so safety policy, Undo/Redo and audit behavior remain visible.

## Trust boundary

The local MCP host is part of the trusted computing base. Elicitation is intended to be surfaced to a human operator. A host configured to auto-approve elicitation removes that human-approval guarantee.

Node ↔ Godot communication remains authenticated and bound to `127.0.0.1`. Project paths are scoped to the active project, and recovery/session metadata rejects symbolic-link traversal where it writes artifacts.
