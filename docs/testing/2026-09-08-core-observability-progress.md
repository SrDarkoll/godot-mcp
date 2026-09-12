# Core refactor and observability — 2026-09-08

R3 and R4 are implemented and verified in this block. The overall objective remains active.

## Critical modules

AuditLog accepts operation metadata and argument hashes rather than raw arguments. ConfirmationStore owns bounded single-use expiry/fingerprint checks. RecoveryJournal owns durable barrier identity and cleanup; RecoveryValidator owns editor readiness and file validation. RecoveryService remains the publication/compensation coordinator.

Recovery state transitions are represented by an exhaustive typed map. An illegal transition leaves the record unchanged. The crash matrix exposed the necessary `rolling_back -> rolling_back` replay transition; it was added and the full matrix passed again. Critical security/recovery modules were formatted consistently with a pinned ephemeral formatter; no production formatting dependency was added.

## New tools

- `session.metrics`: per-tool latency/failure statistics, bounded recent quantiles, queue state, Node memory, editor disconnects and bounded storage inventory with non-destructive quota advisories.
- `session.export`: metadata by default; explicit logs/screenshots/snapshots inclusion, byte budget, hashes and retained incomplete output on failure. It excludes bridge descriptors and previous exports. This is not automatic redaction of private user content.

The catalog now contains 96 tools and its generated schemas/docs match registration. README/changelog and observability documentation were updated.

## Evidence

| Check | Observed result |
|---|---|
| npm test | 158 passed: protocol 20, server 124, CLI 14 |
| npm run typecheck | Passed after production changes |
| Critical policy/recovery/crash/transition suite | 24 passed after extraction and transition validation |
| Observability unit suite | 5 passed, including queue visibility, bounded samples, quota/inclusion, partial-copy failure and disappearing temporary files |
| Integration base | 16 passed before the final disappearing-file guard; new guard covered by focused and full unit suites afterward |
| Observability stdio integration | Real authenticated bridge disconnect counted; export index persisted successfully |
| check:catalog | 96 tools verified |
| Distribution | Metrics and export invoked from independently installed packages outside checkout |

Final distribution evidence for this block: `.godot-mcp/distribution/0.1.0-3ec23acc`; consumer: `C:\Users\ramir\AppData\Local\Temp\godot-mcp-consumer-pCcjTN`.

No native Godot code changed in this block. Previous graphical runs are not presented as fresh runs here. R5, N1–N6 and the final requirement-by-requirement regression remain pending. No Git integration, tagging or publication was performed.
