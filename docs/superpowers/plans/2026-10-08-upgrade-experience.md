# Safe project upgrade implementation plan

**Goal:** Provide `upgrade` for existing installations, confirmed shutdown, Codex migration, backups, verification and recovery without manual TOML edits.

**Scope:** The user's requested 0.6.1 upgrade flow. Execute inline, preserving the Campus project and all unrelated MCP configuration. After implementation and the user's continuation, complete release validation and publication.

**Architecture:** Preflight before shutdown. Authenticate and identify the active project session, then request confirmation and stop only that session. Hold the existing project lease while preparing and publishing a bounded file journal. Stage Godot settings separately, verify with doctor, and compensate from retained backups on failure. A recovery marker blocks older servers from starting against a partial installation. Parse TOML semantically while editing only the recognized Godot server's launch fields.

**Files and checks**

- [x] Reproduce both errors in isolated projects; trace init, Codex setup, authenticated management and addon recovery.
- [x] Add `setup/codex-upgrade.ts`: recognize npm launches and bundled-server recipes, preserve other tables/options/comments, pin the target version and reject ambiguous/unrelated entries before writes. Use a TOML parser for semantic validation.
  Test: `packages/cli/test/codex-upgrade.test.ts`, with old version pins, multiline arrays, quoted keys, env tables, other MCPs, invalid TOML, links, changed files and unknown commands.
- [x] Add `upgrade/upgrade-journal.ts`: bounded ordinary-file backups, atomic checked writes, retained manifest, rollback and interrupted-upgrade recovery. Keep unrelated recovery journals intact.
  Test: `packages/cli/test/upgrade-journal.test.ts`, including injected publication failure, new files, external-edit conflicts and retained backups.
- [x] Add a Godot preparation script that writes upgraded settings to the private staging directory, leaving the saved original unchanged. Prepare the runtime logger from the bundled source.
  Verify with the configured Godot 4.6.3 executable in an isolated fixture.
- [x] Add `upgrade/upgrade-project.ts`: preflight installation and client plan; confirm/stop the authenticated session; acquire the project lease; prepare addon, settings and config; publish journal; run doctor; commit or restore. Recover an interrupted upgrade before retrying.
  Test: offline/live sessions, declined or missing consent, changed session identities, successful migration, failed doctor, rollback and repeated upgrade.
- [x] Extend CLI parsing/runner with `upgrade`, explicit `--yes`, safe non-interactive errors and useful progress/recovery output. Existing `init` offers the upgrade flow instead of mutating first and reporting a generic conflict afterward.
- [x] Synchronize 0.6.1 candidate versions; update CLI help and upgrade documentation. Verify focused unit tests, the full CLI suite, typecheck, Godot preparation and live-server integration, then package-consumer behavior where changed.

**Limits:** The default client configuration scope is project-local Codex. Unknown server commands and unresolved ownership remain protected. Doctor verifies installation health; it does not claim the user's game or visual design passed. An editor already holding old addon code may still need a filesystem scan/reopen, and the client must reconnect to its updated launcher.
