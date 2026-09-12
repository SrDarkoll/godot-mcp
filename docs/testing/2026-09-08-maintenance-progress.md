# Maintenance and recovery validation — 2026-09-08

This block addresses A2/A5 of the approved audit. The complete objective remains active.

Implemented:

- Shared Windows project lease across server startup and addon maintenance, canonical path aliases, release on normal shutdown, startup failure and process death.
- No second server can replace the live bridge descriptor; addon update rejects a live owner, and a pending project recovery journal blocks maintenance.
- Addon journal with hashed before/after blobs, explicit source/target versions, newly created files, durable states, compensation and resumption after process loss.
- Startup blocked by an interrupted addon update. External addon conflicts and corrupt metadata retain evidence and fail closed.
- Real process-kill matrix for seven transaction journal/publication/compensation phases; ordinary and forced recovery preserve their recorded preconditions.

Evidence executed against the worktree:

| Verification | Result |
|---|---|
| npm test | 150 passed: protocol 20, server 116, CLI 14 |
| npm run typecheck | Passed after production changes |
| npm run test:integration | 13 passed before the additional pending-addon startup case |
| project-exclusion.test.ts | Two scenarios cover owner exclusion and pending-addon startup |
| npm run test:distribution | Passed with consumer outside checkout |
| git diff --check | Passed before documentation additions |

Distribution artifacts: `.godot-mcp/distribution/0.1.0-bf061b21`; consumer: `C:\Users\ramir\AppData\Local\Temp\godot-mcp-consumer-TZl2lT`.

Tests containing substantive assertions: `project-lease.test.ts`, `project-exclusion.test.ts`, `recovery-crash.test.ts`, `recovery.test.ts`, `addon-update.test.ts`, `init-project.test.ts`. They cover alias exclusion, independent roots, child-process death, an actual updater kill after creating a file, simulated partial publication, injected disk failure, external-edit preservation and metadata barriers.

The new updater tests include real process termination, not only manually written journal fixtures. Remaining caveat: optimistic existing-file replacement cannot isolate writes by non-cooperating editors. See `docs/tools/project-maintenance.md` for the supported boundary. Visual/runtime graphical suites and remote CI are not claimed as rerun in this block.

Next full-scope work: A6 documentation/release consolidation, R1 typed tool catalog and R2 serialization limits, followed by the remaining R3–R5 and N1–N6 items. No Git integration or publication was performed.
