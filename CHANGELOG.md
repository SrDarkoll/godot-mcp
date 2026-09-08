# Changelog

All notable release-level changes to Godot MCP are documented here.

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
