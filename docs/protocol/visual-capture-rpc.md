# Visual capture bridge protocol (Plan 3)

Protocol remains `1`; the authenticated loopback JSON envelopes and request IDs are unchanged.

| RPC method | Parameters | Result |
|---|---|---|
| `visual.capture_viewport_2d` | `{}` | Capture payload |
| `visual.capture_viewport_3d` | `{"viewport_index":0}` | Capture payload |

`session.manifest` is Node-local and is not sent through the bridge. Label, reason and checkpoint are validated/stored by Node; they are not bridge arguments. No RPC accepts an output path or arbitrary code.

Payload shape:

```json
{
  "png_base64":"<canonical base64 PNG>",
  "width":1060,
  "height":868,
  "scene":"res://main_2d.tscn",
  "captured_at":"2026-09-05T16:46:40Z",
  "viewport_index":null
}
```

The payload is validated before Node writes it. Base64 must be canonical; PNG signature, chunk bounds/CRCs, IHDR dimensions and final IEND must match. Limit: 16 MiB PNG, 4096 per dimension. WebSocket payload and Godot outbound buffer: 24 MiB to accommodate base64 plus JSON. This boundary validates PNG structure; pixel decoding is performed by the Godot integration suite, not by a second image library in the server.

The addon advertises viewport capabilities only for a graphical editor exposing the corresponding API. A specific viewport is checked again during capture. A FIFO consumer permits deferred handler results while WebSocket polling continues. Queue limit is 64; saturation returns `BUSY`. Socket/generation binding prevents an old request response from reaching a new connection. Calls are accepted only after `hello_ack`.

The addon binds its hello to the descriptor used to connect. It periodically detects descriptor replacement and abandons an attempt to the old endpoint; connecting attempts have a five-second deadline. This permits a new MCP session to reconnect the same editor without restarting it. Node exposes the connection and RPC socket only after authenticated version metadata has been persisted.

Node serializes captures, writes the PNG exclusively, synchronizes and closes it, then atomically replaces the JSON manifest through a same-directory temporary file. PNG and manifest are not a multi-file atomic transaction. A failed final publication returns `MANIFEST_WRITE_FAILED` and leaves the PNG in place. Sequences are reserved first and never reused on a normal restart of the store. Session directories cannot be symbolic links/junctions, and manifest identity cannot be changed by an update. This is project-scope enforcement, not protection from an adversarial local process racing filesystem changes.

## Errors

| Code | Meaning |
|---|---|
| `EDITOR_NOT_CONNECTED` | No authenticated editor connection |
| `INVALID_REQUEST` | Invalid or unknown parameters |
| `CAPTURE_UNSUPPORTED` | Headless display or absent viewport API/capability |
| `NO_OPEN_SCENE` | No edited root |
| `VIEWPORT_UNAVAILABLE` | Missing, hidden or zero-sized viewport |
| `CAPTURE_TIMEOUT` | Native render did not complete by deadline |
| `TIMEOUT` | RPC response deadline elapsed |
| `CAPTURE_FAILED` | Scene changed, image unavailable or encoding failed |
| `CAPTURE_TOO_LARGE` | Dimension or image-byte limit exceeded |
| `INVALID_CAPTURE_PAYLOAD` | Malformed capture metadata/base64/PNG |
| `ARTIFACT_WRITE_FAILED` | PNG filesystem write failed |
| `MANIFEST_WRITE_FAILED` | Session index could not be published |
| `SESSION_CLOSED` | Capture requested after session close began |
| `BUSY` | Request queue full |

MCP success contains a text block, an `image` block with `mimeType: "image/png"`, and structured `{sessionId,screenshot,checkpoint}`. Errors use the existing `isError`/structured error response and have no image block. A client losing the connection after persistence may not receive its successful result; consult the retained manifest before manually retrying.
