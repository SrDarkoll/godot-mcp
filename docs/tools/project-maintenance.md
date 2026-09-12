# Project ownership, isolation and addon recovery

## Process ownership

The Windows CLI and MCP entry point acquire the same project lease before starting a server or installing/updating the addon. The lease uses a named pipe derived from the canonical project path. Directory aliases resolve to the same lease. Another project can run independently. An owning server holds the lease until shutdown finishes its project work.

Competing operations fail with `PROJECT_BUSY`. Stop the MCP server before addon maintenance, even if no editor is currently connected. Do not mix an older server lacking the lease with a new CLI. A responsive legacy server is rejected by the updater's management check.

No PID file is used to decide whether a lock is stale. Windows releases the named pipe on process exit, including a crash; this was tested by killing an owning child process. The mechanism follows [Node's Windows IPC semantics](https://nodejs.org/api/net.html#ipc-support). Other platforms currently receive `UNSUPPORTED_PLATFORM` for server startup/maintenance; they are not advertised as supported.

## File transactions

Publication checks the declared before hashes, then rechecks each destination immediately before replacement. Missing-file creation does not replace a file which appeared concurrently. Compensation records expected current hashes and rechecks them before restoration. Forced recovery requires that current content still matches the safety checkpoint captured for that recovery attempt.

A journal remains until publication or compensation is durable. Tests kill real processes after journal sync, applying-state publication, first-file replacement, committed state, rolling_back state, rolled_back state and recovery_required state. Retained snapshots permit explicit recovery in each case.

**Isolation limit:** the lease coordinates cooperating MCP entry points. It does not lock arbitrary filesystem writes by external editors or scripts. Existing-file hash verification followed by rename is optimistic concurrency, not an OS compare-and-swap. There remains a narrow interval in which a non-cooperating writer can change the destination. Multi-file publication is recoverable but not atomically visible to unrelated processes. Avoid external writes during publication, restoration and addon maintenance; never describe these controls as a filesystem sandbox or fully serializable transaction system.

## Interrupted addon updates

The updater saves before and after bytes and an index containing all changed files, including newly created files, source/target plugin versions, hashes and state. Backups are retained under `.godot-mcp/addon-backups/<uuid>/`; old bytes remain under `files/` and new bytes under `after/`.

An exclusive `.godot-mcp/runtime/addon-update.json` journal is written before replacing addon files. A later write failure compensates earlier replacements. If the process crashes, rerunning `addon update` first resumes compensation from the retained journal, then attempts the requested installation. Newly created files are removed only when their contents still match the interrupted update. Unrelated files are untouched.

If an external edit or corrupt backup prevents compensation, the command returns `ADDON_RECOVERY_REQUIRED` and retains the journal and all evidence. Do not delete the journal to bypass recovery. Inspect the backup manifest and conflicting files, preserve the external edit separately, then restore the conflicting path to its recorded before/after content before retrying. Automatic forced overwrite of external addon edits is not provided.

The server refuses startup while an addon-update journal remains. Conversely, addon maintenance refuses any project transaction recovery journal, including a malformed one. Resolve project recovery through MCP before updating the addon. An unreadable stale bridge descriptor does not block maintenance once exclusive project ownership has been acquired.

The addon file set is recovered as a unit; enabling the plugin is a subsequent Godot operation. A plugin-enable failure is reported and should be diagnosed with `doctor`; addon backups are still retained. Captures, session snapshots and update evidence are never automatically purged.
