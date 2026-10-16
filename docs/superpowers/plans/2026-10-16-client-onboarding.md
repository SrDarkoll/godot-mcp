# Client onboarding and short commands

> **For agentic workers:** Execute the scoped tasks below with focused regression checks; do not modify personal client configuration or publish a release.

**Goal:** Document a reproducible first-project setup with short CLI commands and verify the non-Codex client configurations against their official documentation.

**Architecture:** Retain the existing CLI and version-pinned launchers. Add the explicit Cursor STDIO discriminator without changing the Codex launcher. Keep the GitHub and npm README workflows consistent and link a client-specific setup guide.

**Tech Stack:** TypeScript, Vitest, Node.js, Markdown, MCP stdio.

## Task 1: Regression coverage and Cursor configuration

- [x] Parameterize JSON configuration preservation, backups and idempotence over `cursor`, `antigravity` and `claude`, with all user paths redirected into temporary fixtures.
- [x] Expect Cursor entries to include `type: 'stdio'`; retain `command` and `args` for other clients.
- [x] Check short `init --client <name>`, `doctor`, `status` and `upgrade` commands default to the working directory.
- [x] Run `npm run test --workspace @srdarkx/godot-mcp -- client-config.test.ts cli.test.ts` and confirm the Cursor expectation fails first.
- [x] In `configureClient`, build the entry with `const entry: ClientLaunchEntry = { ...makeClientLaunchEntry(projectRoot, options.toolProfile, options.npxPackage), ...(options.client === 'cursor' ? { type: 'stdio' as const } : {}) };`; add `type?: 'stdio'` to `ClientLaunchEntry`.
- [x] Repeat the focused tests and run `npm run build --workspace @srdarkx/godot-mcp`.

## Task 2: README and client guide

- [x] Use `npm install -g @srdarkx/godot-mcp@latest` once, followed by short `godot-mcp` commands; keep explicit `npx --yes @srdarkx/godot-mcp@latest` as an alternative.
- [x] Explain `project.godot` versus the separate Godot executable, PATH errors, client reloads, connection verification and optional runtime activation.
- [x] Document Cursor, Antigravity and Claude Desktop with official source links. Distinguish Gemini CLI and manually configured clients from automatic setup targets.
- [x] Explain Claude Desktop's global project binding and the refresh needed for version-pinned JSON launchers when updating.
- [x] Preserve Codex's existing guide and disclose the non-Git project-root registration step.

## Task 3: Verification and handoff

- [x] Run focused CLI/client tests, compiled stdio shared-session regression tests, `npm run check:docs` and `npm run check:public-package`.
- [x] Review `git diff --check` and the scoped diff.
- [x] Report generated-config/protocol validation separately from native client UI checks. No native-client end-to-end claim without evidence; no commit, push or npm publication in this task.

Results: the new Cursor assertion failed before the fix; all 26 focused CLI, JSON-client, doctor and compiled STDIO shared-session checks passed afterward. The CLI build, documentation link checks and public package metadata checks passed. Native application UI testing was not performed.
