# Changelog

All notable release-level changes to Godot MCP are documented here.

## [0.6.2] - 2026-10-09

- Preview an upgrade with `--dry-run`, including the installed version, Codex launcher change, session impact and backup location, without writing files or stopping the server.
- Recognize verified source-checkout servers and local Node scripts followed by a verified Godot MCP server entry. Replacing these launchers requires explicit confirmation or `--replace-launcher`; the script file is kept.
- Use one interactive confirmation for launcher replacement and session shutdown, including upgrades offered by `init`. Allow questions when input is interactive and output is redirected.
- Keep `--yes` scoped to session shutdown, provide actionable approval commands, preserve edits made during confirmation and report when a session remains stopped after maintenance fails.
- Compare canonical project paths so another filesystem spelling of the same folder is not treated as a different project.

## [0.6.1] - 2026-10-08

- Add `upgrade` with installation preflight, confirmed authenticated shutdown, retained backups, doctor verification and rollback/recovery.
- Migrate recognized project-local Codex npm launches and bundled-server recipes while preserving unrelated MCPs and custom options.
- Make `init` offer the safe upgrade flow for an existing Codex installation before modifying files.
- Pin generated client launchers to the installed package version so the server and addon stay aligned.
- Reject unrelated configurations, conflicting external edits and changed session identities before overwriting or stopping them.

## [0.6.0] - 2026-10-08

### Added

- Native compiler diagnostics with original messages, source paths and real line numbers; unknown locations remain null.
- Snapshot-bound, byte-bounded pagination for TileMap reads, including total counts and stale-cursor detection.
- Retained startup logs and observed launch phases for games that fail before the runtime agent becomes ready.
- Optional project-test contracts in `workflow.run_check`, with separate runtime, engine, project-test and visual-review checks.

### Fixed

- Large TileMap requests no longer hit the default 64 KiB WebSocket input buffer. Encoded requests above the finite 8 MiB limit are rejected before sending.
- Property writes validate types, resource subclasses and safe conversions before mutation; failed loads and conversions preserve the previous value.
- RPC errors distinguish requests that were not applied from mutations with an unknown outcome, retain transport close codes and never replay unconfirmed writes.
- Workflow snapshots and diffs retain diagnostics after failed launches; a healthy runtime no longer implies that configured project tests passed.

### Upgrade notes

- Enumerate `tilemap.get_cells` using `has_more` and `next_cursor`; one page does not represent the entire map.
- Update the server and addon together with `init`. The 194-tool catalog is unchanged.
- Details and measured validation are recorded in [the 0.6.0 release notes](docs/releases/0.6.0.md).

## [0.5.3] - 2026-10-04

- Put a prominent GitHub repository link and invitation to star the project at the top of the npm README.
- Add repository, homepage and issue-tracker metadata to the public npm package.

## [0.5.2] - 2026-09-29

- Explain the package purpose in its public description: AI assistants can create and edit Godot scenes, run games, debug code, and capture screenshots.
- Update Codex setup guidance to reflect its availability in the published npm package.

## [0.5.1] - 2026-09-29

- Add Codex as an `init --client codex` target with project-local MCP configuration, managed updates, and doctor verification.
- Accept paths relative to the edited scene root in `geometry.validate_walkways`, matching the native scene resolver.
- Warn after a changed addon update that an already-open Godot editor may need a FileSystem scan or project reopen.
- Show the required `GODOT_BIN` setup before `check:godot` in the contributor instructions.
- Clarify that `clear: true` covers declared geometry only and `visual.compare` does not judge resemblance to a reference image.

## [0.5.0] - 2026-09-26

### Added

- Read-only walkway geometry validation against declared 2D collisions and endpoint connections.
- Retained capture references that resolve and verify screenshots across MCP sessions.
- Temporary center/zoom framing for running-game captures without saving camera edits.

### Fixed

- Long-polling project events no longer block edits or server shutdown.
- Project lease contention reports known owner details, retries brief maintenance contention, and distinguishes access denial.
- Scene batch type errors explain the expected Variant type and show a valid packed-points value.
- Public transaction and platform guidance now matches the implementation: sequential recoverable publication and Windows runtime support.

### Validation

- Release gates and measured local results are recorded in [the 0.5.0 release notes](docs/releases/0.5.0.md).

## [0.4.0] - 2026-09-12

### Added

- Structured scene/resource batches with bounded prevalidation, stale-state fingerprints, one-step Undo/Redo and verified rollback.
- Resumable project events with cursor pagination, bounded retention, long polling, coalescing and explicit loss counters.
- Resource dependency graphs, inbound move/delete impact analysis and confirmed editor reimport for declared files.
- Deterministic retained screenshot comparison with bounded PNG decoding and difference artifacts.
- Relative runtime performance snapshots and caller-defined regression budgets.

### Changed

- Expanded the canonical public catalog from 183 to 192 MCP tools across all eight profiles.
- Coordinated monorepo, server, protocol, addon and public CLI versions at `0.4.0`.
- Preserved the headless-child addon guard and the existing generated contract, policy, approval and recovery architecture.

### Validation

- Node 22.13.0: 357 unit tests, typecheck, 18 general integrations, 10 runtime integrations, 2 visual integrations, headless manager and advanced DAP debugger gates passed.
- Godot 4.6.3 validated 38 addon scripts plus the generated runtime logger.
- Node 24.20.0: 357 unit tests, typecheck and external-consumer distribution smoke test passed.
- npm public-package checks, 16 release-script tests, tarball consumer installation and `npm publish --dry-run` passed.

## [0.3.3] - 2026-09-08

### Changed

- Enhanced Quickstart with a comprehensive, beginner-friendly 3-step setup guide for Antigravity, Cursor, and Claude Desktop.
- Added support for `run` command alias and `--project` option in the CLI launcher.
- Bumped package versions to `0.3.3` across the monorepo.

## [0.3.2] - 2026-09-08

### Changed

- Transitioned status from Developer Preview to **Stable / Production-Ready** for Godot Engine 4.x.
- Expanded and modernized documentation across GitHub and npm (`@srdarkx/godot-mcp`).
- Streamlined Quickstart with direct zero-friction `npx @srdarkx/godot-mcp init` and AI client bootstrap commands for Cursor, Claude Desktop, and Antigravity.
- Bumped package versions to `0.3.2` across the monorepo.

## [0.3.1] - 2026-09-08

### Added

- **Project Lease (`project-lease.ts`)**: Kernel-level multi-process mutual exclusion via Windows Named Pipes (`\\.\pipe\godot-mcp-project-<hash>`) with immediate OS cleanup on abnormal process termination.
- **Addon Journal (`addon-journal.ts`)**: Atomic addon staging and rollback mechanism with SHA-256 verification, persistent journal markers (`addon-update.json`), and automatic startup recovery (`recoverPending`).
- **Serialization Budgets (`argument-budget.ts`, `serialization_budget.gd`)**: Deep defensive serialization bounds (64 depth, 50,000 items, 8 MB text, and cyclic structure detection via `WeakSet` and GDScript ancestor sets).
- **Reflection Safety (`reflection-safety.ts`, `safety_policy.gd`)**: Blocked 31 dangerous reflective methods (`call_thread_safe`, `emit_signal`, `notification`, etc.), enforced method name syntax `/^[A-Za-z][A-Za-z0-9_]*$/`, and restricted target nodes to the edited scene tree (`_owned_target`).
- **Recovery Modularization (`recovery-journal.ts`, `recovery-state.ts`, `recovery-validator.ts`)**: Decoupled crash recovery journal with `fsync`, formal state machine transitions, and preflight editor validation.
- **Unified Diff Engine (`transaction-diff.ts`)**: Context diffing with line-ending analysis (CRLF/LF), credential redaction, and bounded hunk budgets.
- **Config Repair (`project-config.ts`, CLI `--repair`)**: Safe recovery of damaged `.godot-mcp/config.json` with backups in `.godot-mcp/config-backups/` and symlink attack prevention.
- **Internal Observability & Session Metrics (`telemetry.ts`, `session-storage.ts`, `session-export.ts`)**: High-resolution latency percentiles (p50, p95), storage quotas, and SHA-256 indexed export bundles.

### Changed

- Coordinated monorepo, server, protocol, addon, and public CLI versions to `0.3.1`.
- Expanded monorepo automated test suite to 349 passing tests across 93 test suites.
- Preserved all 183 canonical MCP tool contracts.

## [0.2.0] - 2026-09-07

### Added

- Zero-friction project bootstrap with bounded Godot discovery and MCP client configuration for Cursor, Antigravity, and Claude Desktop.
- A single public npm package target, `@srdarkx/godot-mcp`, with the protocol, server, and Godot addon bundled as private implementation details.
- Release packaging, consumer-install smoke tests, npm publish dry-run validation, and package/version drift checks.
- Advanced DAP debugging support with breakpoint management, stepping, stack inspection, lazy scope variables, and debugger compatibility hardening.
- Headless Godot process management for autonomous validation, imports, tests, and background runs.
- 183 canonical MCP tools across 8 bounded tool profiles.

### Changed

- Coordinated monorepo, server, protocol, addon, and public CLI versions to `0.2.0`.
- Hardened package distribution so bundled workspaces expose their required external runtime dependencies through the public package.
- Hardened npm 11 workspace `publish --dry-run --json` parsing while retaining compatibility with direct package metadata output.
- Updated validation evidence to the current protocol/server/CLI unit-test counts.

### Validation

The 0.2.0 release candidate is expected to pass the canonical Windows validation path against Godot 4.6.3, including build, typecheck, unit tests, release-script tests, single-tarball consumer smoke tests, npm publish dry-run, and the full `scripts/run-all-gates.ps1` runner before any real publication.

### Publication status

`0.2.0` is prepared as a release candidate only. No npm publication, Git tag, or GitHub Release is performed by this preparation change.
