# Project event stream

`project.events` provides bounded pull subscriptions for the current server session. Pass the previous `nextCursor` as `after`; `wait_ms` long-polls for up to 30 seconds. Cursors increase in the server, so addon reconnects do not reuse them.

The stream includes editor connection/disconnection, scene changes/saves, filesystem changes, completed imports and runtime state changes. Event payloads come from project/editor state and are untrusted data.

The server retains the latest 1,000 events and permits at most 16 concurrent waiting reads. A slow reader receives `gap`, `oldestCursor` and the count missed relative to its cursor. The addon coalesces repeated signals during a 100 ms window and waits while its outbound buffer exceeds 256 KiB; `sourceDropped` reports that cumulative coalescing separately from replay eviction. `serverDropped` counts payloads rejected by the 16 KiB event budget.

Events are scoped to the live session and kept in memory. An MCP client reconnecting to the same server can resume. A new server has a new session and cursor space. Shutdown wakes pending readers with `closed: true`.
