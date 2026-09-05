# Runtime RPC extension — protocol 1

Public tools are documented in [runtime-debugger.md](../tools/runtime-debugger.md). This additive extension retains the authenticated Node/editor bridge and introduces the native `godot_mcp` debugger prefix between editor and game. No new game listener is created.

## Identity and readiness

Node allocates a run UUID and registers it before `runtime.start`. Internal start includes target (`main`, `current` or `path`), runId and mcpSessionId. The editor only binds a runtime hello to its own pending launch. Game ready confirms current scene, run ID and features. Messages from a different debugger session, MCP session or run are rejected. A fresh manual debugger session resets the previous owner's authorization.

The engine-side callback receives suffixes (`bind`, `request`), while EditorDebuggerPlugin receives full prefixed names. A request contains `protocol`, `mcpSessionId`, `runId`, `requestId`, fixed allowlisted `method` and dictionary `params`. Responses echo IDs and `ok/result` or `ok/error`. No runtime write/arbitrary-call endpoint is registered.

Start deadline is 15 seconds, Node RPC 20 seconds. Ordinary forwarded requests have a 3-second runtime deadline; Node RPC 5 seconds. Stop waits up to 5 seconds with Node RPC 7 seconds. Pending calls are cancelled on stop, break or session change. Stop/status bypass the editor FIFO using a bounded control lane. The runtime pending map is bounded to 32 entries.

## Events

Authenticated editor events use this envelope:

```json
{
  "type":"event",
  "protocol":1,
  "sessionId":"<MCP-session>",
  "sequence":1,
  "event":"runtime.state",
  "data":{
    "state":"running","runId":"<UUID>","scenePath":"res://main.tscn",
    "connected":true,"ownership":"session",
    "features":{"inspect":true,"scenePause":true,"gameCapture":true,"diagnostics":true,"performance":true},
    "errorCode":null
  }
}
```

Sequence increases within the authenticated connection. BridgeServer separates events from normal RPC responses and rejects wrong session IDs, repeated/nonmonotonic sequences and stale sockets. RuntimeService additionally checks run IDs. `runtime.diagnostics` carries a validated `{runId,entries,dropped}` batch. The existing `session.status.runtimeConnected` reflects ready/disconnected state.

Diagnostic batches contain up to 50 entries; the Logger drains at most 20 batches per second and keeps its serialized batch below 240 KiB before identity overhead. An entry records sequence, timestamp, kind, stream, message, origin file/line/frame and truncation. Node writes escaped JSONL serially, deduplicates sequences and preserves cursors after filtering. Errors in log persistence mark it degraded without crashing game control. Manifest publication failures are surfaced separately.

## Image fragments

Game capture uses `capture_begin`, `capture_chunk`, `capture_end`. All packets contain mcpSessionId, runId, requestId and captureId. CaptureId is derived from the run/request identity. Begin adds totalChunks, totalBytes, SHA-256, dimensions, scene and UTC capture timestamp.

Each fragment is at most 65536 base64 characters. At most four fragments are sent per process frame. Total bounds: 342 fragments, 16 MiB decoded PNG, 4096 pixels per axis. Assembly rejects duplicate headers, out-of-order/missing/oversized data, changed identity and hash mismatch. An invalid/finished ticket cannot be overwritten by a later packet. The editor has an 8-second assembly deadline, and Node's game capture RPC uses 10 seconds. Stop cancels the ticket and frees its assembly state.

After assembly the editor returns the normal Plan 3 PNG payload plus `run_id`. Node checks run identity and persists via the shared screenshot store, including PNG CRC/size checks. Public game artifacts have runId, type `game`, viewportIndex null and the `screenshots/game` folder. Old editor artifacts without runId parse as null; manifests without runtimeRuns parse as an empty array. Manifest version remains 1.

## Failure boundaries

Errors include `RUNTIME_ALREADY_RUNNING`, `RUNTIME_NOT_OWNED`, `RUNTIME_NOT_CONNECTED`, `RUNTIME_BREAKED`, `RUNTIME_START_FAILED`, `RUNTIME_START_TIMEOUT`, `RUNTIME_STOP_TIMEOUT`, `MULTIPLE_RUNTIME_SESSIONS`, `SCENE_NOT_SAVED`, `CAPABILITY_UNAVAILABLE`, `RUN_NOT_FOUND`, `NO_RUNTIME_HISTORY`, `RESULT_TOO_LARGE` and the existing request/capture/persistence errors.

This is not a durable replay protocol for every engine log. Abrupt termination can lose the final runtime queue, and startup errors can occur before the Logger exists. The manifest therefore does not assert complete diagnostics. Session directory protections prevent ordinary project-scope escapes; they are not a sandbox against malicious project scripts or another local process racing filesystem mutations.
