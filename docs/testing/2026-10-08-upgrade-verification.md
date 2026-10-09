# Upgrade experience verification

This report records local verification of the 0.6.1 safe upgrade flow before publication.

## Reproduced gaps

The previous `init` acquired the maintenance lease before offering a session shutdown. Its CLI then installed the addon before calling the Codex writer, which intentionally rejected unmarked server entries. A valid legacy config could therefore block after the addon had changed.

The new CLI preflights Codex before shutdown or installation. `upgrade` migrates recognized launches; `init` offers that flow for an existing Codex installation and reports `UPGRADE_AVAILABLE` in noninteractive mode. Shutdown is authenticated and checks the session identity against the confirmed session. Generated launchers pin the installed version.

## Evidence

- 401 unit tests passed: protocol 56, server 307, CLI 38. The server suite includes changed-session shutdown rejection; CLI tests cover migration, unrelated config preservation, concurrent edits, invalid/linked files, rollback, retained backups and interrupted-journal recovery.
- Three integration cases passed with Godot 4.6.3: legacy Codex migration, failed-doctor compensation, and an active session that remains unchanged without consent and then shuts down through authenticated management.
- The complete general integration suite passed 23 tests across 20 files after the CLI changes.
- A separate external-consumer validation installed the authentic 0.5.3 public tarball, initialized a project with its old CLI, started its actual MCP server, and ran the 0.6.1 candidate's upgrade. It confirmed 0.5.3 to 0.6.1, exact TOML backup, preserved other MCP configuration, passed doctor and a newly started 0.6.1 server.
- The single-tarball consumer smoke test passed with `upgrade --client codex`, version-pinned configuration, public-package Codex setup, MCP status and authenticated shutdown.
- TypeScript/typecheck passed, Godot parsed 42 addon scripts plus the generated logger, 16 release-script tests passed, and documentation links passed.

Evidence artifacts stay in ignored `.godot-mcp/feedback-test-runs/` and `.godot-mcp/cli-test-runs/` directories. The Campus project was not changed or stopped.

## Limits

The migration scope is project-local Codex. Unknown commands, other project targets and ambiguous layouts are protected; inline/dotted legacy server declarations are currently refused. A user-held global Codex profile is not edited automatically. External changes that conflict with rollback retain the recovery marker and backups for review.

Doctor verifies installation health, not game correctness. An editor holding old addon code still needs a scan/reopen, and the client must reconnect. When an upgrade fails after an authorized shutdown, restored files do not resurrect the old stdio connection; the CLI reports that the session remains stopped.

Graph verification used generation `2026-10-09T02:46:20Z` with both init/Codex call directions and exact snippets. Final coverage marked edited and new files as modified/untracked; current source and executable tests provided the evidence for those changes.
