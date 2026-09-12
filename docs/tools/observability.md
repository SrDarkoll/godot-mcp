# Session observability and exports

`session.metrics` reports per-tool counts/failures, lifetime mean/max latency, mean queue delay and p50/p95 over at most the last 128 samples. Latency includes queue time. Storage scanning and the metrics call itself are reflected in subsequent samples. Tool-name cardinality is bounded.

The response also contains the current operation queue, Node process memory, editor-connection transitions/disconnects, uptime and a sampling timestamp. Memory fields describe Node, not Godot. Use `debug.performance` for runtime engine counters. Disconnect counts include normal connection closures; they do not imply an error by themselves.

Storage inventory visits at most 10,000 entries in the current session, skips links and reports `observedBytes`, `truncated`, `skippedLinks` and `changedDuringScan`. A partial or changing inventory is not a complete current disk-usage claim. Disappearing temporary files do not interrupt metrics. `quota_bytes` defaults to 1 GiB and only controls an advisory. Quota, scan-limit and link advisories never delete data or stop the game.

`session.export` writes a new retained directory under the session's `artifacts/export-<uuid>/`. Default contents are manifest.json and metrics.json. Logs, screenshots and transaction/checkpoint snapshots require `include_logs`, `include_screenshots` or `include_snapshots`. These may contain private source, messages and game content; inclusion is not publication or permission to share them.

The export index records completion, byte lengths and SHA-256 for each data file. Previous exports and project/runtime bridge descriptors are excluded. This is scope filtering, not automatic secret redaction of user content. `max_bytes` defaults to 32 MiB and is bounded at 128 MiB, with conservative space reserved for the index. Over-budget/incomplete inventories fail before copying.

If copying fails, partial files remain with an incomplete index where it can be persisted, and EXPORT_FAILED includes their path. No original artifact is removed. Runtime logs may continue changing while an export is read, so the export is a best-effort evidence snapshot with checksums of the bytes copied, not an atomic filesystem snapshot.

Metrics can be queried while a project writer is active so queue state remains observable. Export is serialized through the normal write gate. The current process owns live counters; exporting metrics retains a snapshot rather than creating continuous background sampling.
