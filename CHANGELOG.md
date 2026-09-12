# Changelog

All notable release-level changes to Godot MCP are documented here.

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
