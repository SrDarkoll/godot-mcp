# Official Codex Client Implementation Plan

> **Execution:** Implement inline on `feat/codex-official-client`; preserve the tagged 0.5.0 artifact and do not publish npm in this change.

**Goal:** Make Codex a first-class `init --client codex` target with a safe project-local MCP configuration, a consistent manual recipe, and verified package instructions.

**Architecture:** Reuse the existing public-package stdio launcher and tool-profile selection. Write only a bounded, marked `[mcp_servers.godot-mcp]` block in the trusted project's `.codex/config.toml`; leave user-wide Codex settings alone, preserve unrelated TOML, back up changes, and reject conflicting unmanaged server entries. Keep JSON client configuration behavior unchanged.

**Tech Stack:** TypeScript, Node 22+, Vitest, Codex `config.toml`, Windows package-consumer smoke test.

---

## Task 1: Safe project-scoped Codex writer

**Files:** `packages/cli/src/setup/codex-config.ts`, `packages/cli/src/setup/client-config.ts`, `packages/cli/test/client-config.test.ts`.

- [x] Add a failing test for `configureClient({client:'codex',projectRoot,toolProfile:'2d'})`: require `.codex/config.toml` with `command = "npx"` and the public package `start --tool-profile 2d` arguments.
- [x] Add failing tests for idempotency, preserving unrelated tables with a backup, rejecting an unmanaged `[mcp_servers.godot-mcp]` table, and rejecting a linked config path.
- [x] Implement a managed TOML block and bounded file checks. Example entry:

```toml
[mcp_servers.godot-mcp]
command = "npx"
args = ["--yes", "@srdarkx/godot-mcp", "start", "C:/Games/MyGame", "--tool-profile", "2d"]
```

- [x] Run the focused configuration tests.

## Task 2: CLI and verification

**Files:** `packages/cli/src/cli-args.ts`, `packages/cli/src/setup/codex-recipe.ts`, `packages/cli/src/doctor/doctor.ts`, `packages/cli/test/cli.test.ts`, `packages/cli/test/codex-recipe.test.ts`, `packages/cli/test/doctor.test.ts`.

- [x] Accept `--client codex` on `init`; keep `setup codex` as a read-only recipe for the local source-built server before the matching npm version is published.
- [x] Verify a managed Codex entry in `doctor` only when that entry is present; do not require Codex for projects configured for other clients.
- [x] Confirm a second init with the same profile makes no change and changing profile backs up the old file.

## Task 3: Public guidance and package evidence

**Files:** `README.md`, `packages/cli/README.md`, `docs/tools/codex.md`, `scripts/smoke-release.mjs`, `CHANGELOG.md`.

- [x] Add Codex to the quickstart and explain trusted project configuration, restart, and `codex mcp list` verification using current official OpenAI documentation.
- [x] Exercise `init --client codex` from the single public tarball in an external consumer project; check the TOML entry and MCP session.
- [x] Run docs links, package checks, typecheck, 371 unit tests, distribution smoke test and publication dry run. Codex CLI parsed the generated TOML from an isolated config home.
- [ ] Run the required Windows Node 22/24 CI matrix, including live Godot gates.

## Task 4: Delivery

- [x] Inspect the diff and confirm no user-wide Codex config, tag, npm publication or unrelated project files changed. An early red test touched Claude's config; it was restored byte-for-byte from its pre-test backup, and both temporary backups were removed before continuing.
- [ ] Commit, push, attach a PR, and require the Windows Node 22/24 CI matrix before merge.
