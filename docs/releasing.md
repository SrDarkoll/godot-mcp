# Release procedure

No release is automatically published by the commands below. Package manifests currently remain private. Publishing/tagging requires an explicit integration decision after validation and review.

1. Review the working-tree diff, unresolved journals, version changes, changelog and compatibility statement. Do not package test credentials, private projects or runtime descriptors.
2. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run check:catalog`, `npm run check:godot` and required integration suites with the pinned engine. Run graphical/runtime checks in their supported environment.
3. Run `npm run release:pack` and inspect the generated file allowlist/hash manifest. All four package versions/dependencies must agree. Addon package contents include the native scripts; server/CLI/protocol use built output.
4. Run `npm run test:distribution`. Inspect its retained report and external consumer path. Confirm help, initialization, setup recipe, MCP session.status and authenticated CLI status/stop succeed without access to checkout source.
5. Review generated artifacts and any proposed CI archive for private data. Captures and recovery snapshots are retained locally, not implicitly approved for sharing.
6. Record exactly which local and remote checks ran. The Windows Node 22/24 workflow and manually triggered graphical self-hosted workflow are definitions, not evidence of completed GitHub jobs.

If a gate fails, correct the cause and rerun the affected checks. Do not claim production readiness based solely on compilation, test counts or npm's vulnerability summary. A published artifact should be tied to a reviewed Git state; this worktree's uncommitted implementation must first be integrated explicitly.
