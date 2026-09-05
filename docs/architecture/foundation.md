# Foundation Architecture

Historical Plan 1 scope. The subsequent [visual capture guide](../tools/visual-capture.md) and [visual protocol](../protocol/visual-capture-rpc.md) describe Plan 3's implemented extension.

This document describes the Plan 1 foundation milestone. It intentionally covers only the read-only editor handshake and the infrastructure needed by later mutation, runtime, visual, transaction, and security milestones.

## Data flow

```text
MCP client (for example Codex)
        |
        | MCP over stdio
        v
@source: packages/server
Node.js MCP server
        |
        | authenticated WebSocket
        | ws://127.0.0.1:<port>
        v
addons/godot_mcp
Godot 4 EditorPlugin
        |
        +--> EditorInterface / ProjectSettings
```

The MCP client starts one server for one project. The server creates one persistent session and listens for one active Godot addon connection. The addon is an outbound WebSocket client; Godot never opens a network listening socket in the foundation milestone.

## One active project

A server process resolves exactly one project root from `--project` (or the current working directory). The bridge authenticates an addon only when its reported project root matches that session's project root. A second addon connection is rejected while the first authenticated editor remains connected.

This prevents an agent command intended for one project from silently reaching another open Godot editor.

## MCP stdio ownership

The Node server communicates with its MCP client through stdin/stdout. Therefore **stdout belongs exclusively to the MCP transport**. Server diagnostics and shutdown errors use stderr.

Application code must not add ordinary `console.log()` diagnostics to the server process, because arbitrary stdout text would corrupt the MCP stream.

## Loopback-only bridge

The Node WebSocket server binds only to:

```text
127.0.0.1
```

The runtime descriptor also records `host: "127.0.0.1"`, and the addon refuses descriptors whose host is anything else. This foundation does not expose a LAN or Internet control endpoint.

## Ephemeral bridge authentication vs persistent sessions

Two storage areas have intentionally different lifetimes.

### Persistent session data

```text
.godot-mcp/sessions/<session-id>/
```

A session directory persists after shutdown. In Plan 1 it contains the session manifest and directories reserved for later screenshots, transactions, checkpoints, logs, events, and artifacts.

### Ephemeral runtime descriptor

```text
.godot-mcp/runtime/bridge.json
```

The descriptor contains the current loopback port, protocol version, session id, server pid, and a random session token. The token is generated with 32 random bytes and encoded as hex. The descriptor is written atomically through `bridge.json.tmp` and removed during clean server shutdown.

The token is not a durable project credential. Restarting the MCP server creates a new token/session binding.

## Addon discovery and reconnect behavior

The Godot addon periodically checks `res://.godot-mcp/runtime/bridge.json` while disconnected. When it finds a valid loopback descriptor, it attempts a WebSocket connection and sends one `hello` after the socket opens.

If the socket closes, the addon clears its connection state and resumes descriptor polling. This means restarting the Node server does not require restarting Godot; the addon can discover the new descriptor and reconnect.

## Authentication sequence

```text
Node server                           Godot addon
    |                                    |
    | write bridge.json                  |
    |<-----------------------------------| poll descriptor
    |                                    |
    |<---------- WebSocket connect ------|
    |<-------------- hello --------------|
    | validate token/protocol/root       |
    |-------------- hello_ack ---------->|
    |                                    |
    |<======== structured RPC ==========>|
```

The server validates the token, protocol literal `1`, and project root before accepting the editor as connected.

## Read surface in Plan 1

Only two editor RPC methods are accepted:

- `project.info`
- `scene.get_tree`

The addon dispatcher uses an explicit method match. It does not accept an `exec` field, arbitrary GDScript strings, dynamic method names, or reflective arbitrary invocation.

The MCP server exposes these editor reads plus `session.status`. `session.status` remains available when no editor is connected; editor-dependent reads return a structured error.

## What is intentionally not implemented yet

Later approved milestones own:

- scene/node/script/resource mutation;
- Undo/Redo integration;
- runtime/debugger inspection and mutation;
- editor/game screenshots;
- visual checkpoints;
- permissions/risk classification;
- transactional snapshots/rollback/checkpoints;
- expanded audit logging;
- headless project tools beyond foundation checks;
- Codex auto-registration and release packaging.
