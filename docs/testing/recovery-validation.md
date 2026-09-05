# Transactions and recovery validation — 2026-09-05

Plan 5 was implemented over the uncommitted Plans 3–4 on `feat/foundation-editor-handshake`, based on `7e0b327`. No staging, commit, push, merge or automatic snapshot/screenshot cleanup was performed.

## Verified results

| Check | Result |
|---|---|
| Build and `npm run typecheck` | Passed for all TypeScript packages |
| `npm test` | 118 passed: protocol 20, server 95, CLI 3 |
| Mandatory base integration | 8 passed across 7 files |
| Editor visual integration | 2 passed |
| Runtime integration | 7 passed, including priority stop during capture |
| `npm run check:godot` | 23 addon scripts plus generated Logger passed |
| `git diff --check` | Passed |

Target: Windows, Godot 4.6.3. These are task-directed checks, not a production-readiness or all-engine-version claim.

## Evidence and scenarios

Latest retained native fixture: `.godot-mcp/recovery-test-runs/recovery-9VU3Y3/`. Its `evidence.json` identifies the session, transactions and file checkpoint. The session retains before/after blobs, transaction indexes, checkpoint data and `logs/audit.jsonl`. `engine.log` preserves native validation output. Syntax evidence is `.godot-mcp/visual-test-runs/syntax-YBJK3V/syntax-results.json`.

The real MCP/Godot scenario verified:

1. Begin refuses an open scene. The fixture explicitly confirms closing its own saved scene.
2. A checkpoint captures the baseline scene and script.
3. Two staged edits leave original files unchanged until publication; unrelated node mutation is blocked while the transaction is open.
4. A confirmed commit publishes a changed scene and invalid GDScript. Native validation fails; the operation reports `rolled_back`, with both files restored exactly, including the script's CRLF bytes.
5. A second, valid batch commits; reopening the scene reports its changed position `(52,63)` through Godot.
6. Confirmed checkpoint restoration returns both files to baseline and retains a restore transaction.
7. Audit contains operation metadata but no raw invalid script body. Disabling editor modification blocks a node mutation through MCP.
8. A fresh MCP server session resets permissions and can list the prior session's file checkpoint.

Filesystem tests separately verified missing/binary files, untouched unrelated files, path/junction rejection, outside-edit conflicts, second-file write failure with compensation, and restart from a persisted in-progress journal. A conflicting human edit is preserved by default; confirmed force recovery first stores its bytes in a checkpoint before restoring the original transaction snapshot.

Policy tests verified exact single-use confirmation/fingerprint binding, stale-file rejection, dangerous permission enable-alias confirmation, disabled permissions before editor inspection, open-transaction exclusion, read/write coordination, a nonblocking runtime control lane and waiting for an executing writer during shutdown. The previous mutation test now explicitly confirms its known reload operation; forbidden reflective `free` remains blocked instead of becoming confirmable.

## Boundaries

This is file-based compensation with a durable journal, not a multi-file OS transaction or a snapshot of unsaved editor state. Publication requires scene tabs closed; script/resource editors affecting selected files must also be closed. Dependencies make this intentionally conservative. Ordinary editor node operations retain separate native Undo/Redo and are not staged inside these transactions.

Recovery detects fingerprints and verifies snapshot hashes but does not sandbox external programs/project scripts or prove human approval behind a caller-supplied token. Checkpoints are selected on-disk files, not a full recursive project copy. Unsupported file types cannot be newly committed as validated code; exact checkpoint restoration is distinct from compilation.

The native fixture deliberately produces invalid GDScript, and its parse errors are expected evidence of validation rejection. The pre-existing mutation fixture also emits its intentional parser diagnostic and the known headless thumbnail texture warning. Dedicated check-only validation of addon scripts passes; these fixture messages are not reported as a pristine global engine log.

Final process inventory contained only the pre-existing personal Godot editor. All test-created editors were closed. Snapshots and logs remain local and ignored by Git. Further hardening can expand validation types, editor-state transactions and adversarial cross-process isolation without weakening the current conservative guards.
