# Foundation Bridge RPC Protocol

This document describes the historical foundation surface. Plan 3 adds the [visual capture RPC methods](visual-capture-rpc.md) without changing protocol version 1.

Protocol version: `1`

The foundation bridge is JSON over a localhost WebSocket. Node owns the listening socket; the Godot addon connects outbound. Requests and responses are structured data. Arbitrary executable GDScript is not part of the protocol.

Values below are illustrative. Tokens, PIDs, ports, session IDs, versions, and paths vary per session/machine.

## Bridge descriptor

Location:

```text
<project>/.godot-mcp/runtime/bridge.json
```

Example:

```json
{
  "sessionId": "2026-09-05T00-31-00-000Z_3f2a91b7",
  "host": "127.0.0.1",
  "port": 61337,
  "token": "8ea7ef7ce099df4e762b901b6152432d3cbc670274fca2d6aa6e4d11de3e3fa7",
  "pid": 42420,
  "protocol": 1
}
```

The addon accepts only `127.0.0.1`, a valid TCP port, protocol `1`, and a token of at least 32 characters. The server currently generates a 64-character hex token from 32 random bytes.

## Addon hello

The first addon message is:

```json
{
  "type": "hello",
  "token": "8ea7ef7ce099df4e762b901b6152432d3cbc670274fca2d6aa6e4d11de3e3fa7",
  "protocol": 1,
  "addonVersion": "0.1.0",
  "godotVersion": "4.7.2.stable.official",
  "projectRoot": "C:/Projects/GodotMcpFixture",
  "capabilities": {
    "editor": true,
    "runtime": false,
    "debugger": false,
    "viewport2d": true,
    "viewport3d": true,
    "undoRedo": true
  }
}
```

The server rejects an invalid token, a protocol mismatch, a different project root, or a second active editor connection.

## Hello acknowledgement

After authentication the server replies:

```json
{
  "type": "hello_ack",
  "protocol": 1,
  "sessionId": "2026-09-05T00-31-00-000Z_3f2a91b7"
}
```

Only after this authenticated handshake should normal bridge RPC be considered established.

## RPC request envelope

```json
{
  "id": "req-1",
  "protocol": 1,
  "method": "project.info",
  "params": {}
}
```

Requirements:

- `id`: non-empty string used for response correlation;
- `protocol`: literal number `1`;
- `method`: lowercase dotted identifier matching `^[a-z][a-z0-9_.]*$`;
- `params`: JSON object.

## `project.info`

Request:

```json
{
  "id": "req-1",
  "protocol": 1,
  "method": "project.info",
  "params": {}
}
```

Success:

```json
{
  "id": "req-1",
  "ok": true,
  "result": {
    "name": "Godot MCP Fixture",
    "projectRoot": "C:/Projects/GodotMcpFixture",
    "projectFile": "C:/Projects/GodotMcpFixture/project.godot",
    "godotVersion": "4.7.2.stable.official",
    "activeScene": "res://main.tscn"
  }
}
```

## `scene.get_tree`

Request:

```json
{
  "id": "req-2",
  "protocol": 1,
  "method": "scene.get_tree",
  "params": {}
}
```

Success for the deterministic fixture:

```json
{
  "id": "req-2",
  "ok": true,
  "result": {
    "scenePath": "res://main.tscn",
    "root": {
      "name": "Main",
      "type": "Node2D",
      "path": "/Main",
      "script": null,
      "children": [
        {
          "name": "Player",
          "type": "CharacterBody2D",
          "path": "/Main/Player",
          "script": null,
          "children": [
            {
              "name": "Camera2D",
              "type": "Camera2D",
              "path": "/Main/Player/Camera2D",
              "script": null,
              "children": []
            }
          ]
        }
      ]
    }
  }
}
```

If no edited scene is active, `scenePath` and `root` may both be `null`.

## Failure envelope

Unknown method request:

```json
{
  "id": "req-3",
  "protocol": 1,
  "method": "node.delete",
  "params": {}
}
```

Foundation response:

```json
{
  "id": "req-3",
  "ok": false,
  "error": {
    "code": "METHOD_NOT_FOUND",
    "message": "Unknown method: node.delete"
  }
}
```

The TypeScript protocol also defines structured bridge error codes for invalid requests, authentication/protocol/project mismatches, missing editor connection, timeouts, and internal failures. Later milestones may add new explicitly defined methods while retaining the envelope and protocol negotiation rules.
