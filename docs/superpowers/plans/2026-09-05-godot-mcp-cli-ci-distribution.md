# Godot MCP CLI, CI & Distribution Preparation Plan

> Execute inline with TDD and verification-before-completion. Preserve the current uncommitted milestones. Do not publish, stage, commit, push, merge, tag or change the user's Codex configuration.

**Goal:** Installable local packages can initialize a Godot project, run MCP over stdio, report/stop the authenticated server, inspect sessions and explain configuration; repeatable Windows checks prepare a future release.

**Architecture:** The CLI reuses server configuration and session readers. A narrowly scoped management role uses the existing loopback WebSocket with the existing ephemeral token and project identity; it never replaces the editor connection or sends OS kill signals. Packaging uses explicit npm file lists and an isolated consumer test. CI keeps graphical tests on an explicitly selected runner.

**Scope:** CLI help/version/JSON errors, persistent Godot/port configuration, foreground start, authenticated status/stop, read-only permissions and session inspection, addon install/update aliases, Codex recipe output, package smoke tests and project documentation/workflows. Destructive session cleanup/addon removal, automatic global Codex registration, a headless tool manager and public publishing are excluded.

## Tasks

1. **Configuration:** tests for defaults, invalid values, retained unknown keys and safe atomic writes; implement a shared project-config module. Init preserves the chosen port and stores the selected executable. Ignore personal local config.
2. **Management:** tests for authenticated status alongside an active editor, wrong tokens/project roots, bounded handshake/shutdown and stale descriptor ownership. Add only `status`/`shutdown` messages; verify identity before responding. Do not kill a PID obtained from disk.
3. **CLI:** test parsing, missing/duplicate flags, help/version, JSON success/error, bounded subprocess execution and no banners on `start`. Implement commands through reusable functions; resolve installed package paths rather than checkout paths.
4. **Inspection/setup:** list validated session summaries with a bounded page, inspect selected manifests, show actual live permissions or explicitly labelled defaults. `setup codex` prints a command/config recipe only; it does not modify the profile.
5. **Distribution:** explicit files/engines/license metadata for the four packages; pack to an ignored output directory, check package contents and hashes, install all four tarballs into a separate consumer, exercise CLI and MCP stdio there. Keep packages private until publishing is separately authorized.
6. **CI/docs:** Windows Node 22/24 build/typecheck/tests, pinned Godot 4.6.3 headless validation with checksum verification, artifact checks and an opt-in graphical workflow. Add contribution/security/conduct/changelog/issue templates and installation/release guidance. Never upload runtime bridge credentials or automatically clean local screenshots.
7. **Final verification:** run focused red/green tests, full unit/typecheck, base/graphical/runtime regression and package smoke test. Record local results separately from unexecuted GitHub Actions. No release is called published or production-ready.

## Key contracts

- `godot-mcp init|doctor|status|stop|config|permissions [path] [--json]`.
- `godot-mcp start [path] [--bridge-port <0..65535>]` reserves stdout for MCP.
- `godot-mcp sessions list [path] [--limit <1..200>] [--before <session-id>] [--json]` and `sessions inspect <id> [path] [--json]`.
- `godot-mcp addon install|update [path] [--godot <exe>] [--json]` reuse installation.
- `godot-mcp setup codex [path] [--json]` emits a reviewable recipe using the installed server entry point.
- JSON CLI errors are bounded `{ok:false,error:{code,message}}`; usage errors exit 2, operational errors 1, success 0. MCP start never prints CLI JSON/banners.
- Management request: `{type:'management',protocol:1,requestId,token,projectRoot,command:'status'|'shutdown'}`. Response echoes requestId/sessionId; tokens are never returned.
- Descriptor removal checks session ownership; a previous process must not remove a replacement descriptor. Unauthenticated peers and shutdown are time-bounded.
- Config defaults remain protocol 1 / port 61337. CLI overrides take precedence over saved config. Permissions remain session-only and are never loaded as persistent rights.

## File map

Shared modules under `packages/server/src/project/project-config.ts` and `management/`; protocol management schemas; bridge/index/descriptor integration. CLI parser/inspection/setup modules under `packages/cli/src/`, with tests. Packaging scripts under `scripts/`; workflow files under `.github/workflows/`; guides under `docs/installation/` and `docs/testing/`.

Acceptance requires a clean independent package consumer to initialize a fixture and exchange a real MCP `session.status` call, plus a verified authenticated CLI stop of that server. Remote CI and publishing remain unexecuted until authorized.
