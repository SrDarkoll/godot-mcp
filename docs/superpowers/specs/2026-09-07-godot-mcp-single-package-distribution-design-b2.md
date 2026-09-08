# Godot MCP 0.2 Single-Package Distribution Design — Option B2

**Date:** 2026-09-07
**Status:** Approved architecture; implementation not started
**Milestone:** Godot MCP 0.2 — Zero-Friction Distribution
**Public package:** `@srdarkx/godot-mcp`
**Baseline:** local commit `9514791` (`feat(cli): add zero-friction project bootstrap`) with the user-reported Windows validation runner GREEN.

## Goal

Ship Godot MCP to end users as one public npm package and one installable tarball while preserving the existing monorepo boundaries:

```powershell
npx -y @srdarkx/godot-mcp init . --client antigravity
```

Generated MCP client configs launch:

```text
npx --yes @srdarkx/godot-mcp start <project> --tool-profile <profile>
```

Users must not need to know that protocol, server, CLI, and the Godot addon remain separate workspaces internally.

## Why the original Option B needs one revision

The original design relied on npm resolving exact-version internal workspaces and then including them directly through `bundleDependencies` during `npm pack --workspace`.

A Windows repro using the authoritative environment (`Node v22.13.0`, `npm 11.6.4`) showed two relevant behaviors:

1. `npm install --package-lock-only` fails in this topology with an invalid `file:../packages/cli` resolution outside the repro root.
2. A normal workspace install succeeds, but `npm pack --workspace ...` reports `"bundled": []` and omits the internal workspaces when they exist only in the hoisted/root workspace layout.

A second Windows repro proved the required correction: when the three internal workspaces are materialized as package-local directory links beneath the public package's own `node_modules/@godot-mcp`, the same npm 11.6.4 `npm pack --workspace` reports all three packages in `bundled` and includes them physically in the tarball.

Therefore B2 keeps npm `bundleDependencies`, exact `0.1.0` dependency declarations, and the existing workspace architecture, but adds an explicit temporary package-local link materialization step before packing.

## Non-goals

This change does not:

- add MCP tools;
- change protocol, bridge, DAP, runtime, transaction, checkpoint, or Risk Gate behavior;
- collapse workspace source boundaries;
- add esbuild, rollup, tsup, or another JavaScript source bundler;
- change internal package dependencies to `file:../...`;
- publish internal `@godot-mcp/*` packages;
- require internal tarballs in the consumer install;
- certify new operating systems;
- publish to npm;
- create a GitHub Release;
- bump implementation to `0.2.0`;
- push or merge without explicit authorization.

## Architecture

Preserve the monorepo:

```text
godot-mcp-monorepo                 private root
|
+-- @godot-mcp/protocol            internal workspace
+-- @godot-mcp/server              internal workspace
+-- @godot-mcp/godot-addon         internal workspace
+-- @srdarkx/godot-mcp             sole public workspace (packages/cli)
```

The existing CLI workspace becomes the public facade. The internal package identities remain unchanged:

```text
@godot-mcp/protocol
@godot-mcp/server
@godot-mcp/godot-addon
```

The repository root becomes `godot-mcp-monorepo` and remains `private: true`.

## Public package manifest

`packages/cli/package.json` becomes the public package:

```json
{
  "name": "@srdarkx/godot-mcp",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "godot-mcp": "dist/index.js"
  },
  "engines": {
    "node": ">=22"
  },
  "license": "MIT"
}
```

It retains the three internal runtime packages as exact production dependencies:

```json
{
  "dependencies": {
    "@godot-mcp/protocol": "0.1.0",
    "@godot-mcp/server": "0.1.0",
    "@godot-mcp/godot-addon": "0.1.0"
  },
  "bundleDependencies": [
    "@godot-mcp/protocol",
    "@godot-mcp/server",
    "@godot-mcp/godot-addon"
  ]
}
```

No dependency may be changed to a `file:` specifier to make packaging pass.

## Package-local bundled dependency materialization

Before `npm pack`, the release packer creates a temporary package-local dependency layout equivalent to:

```text
packages/cli/
+-- node_modules/
    +-- @godot-mcp/
        +-- protocol    -> packages/protocol
        +-- server      -> packages/server
        +-- godot-addon -> packages/godot-addon
```

These are temporary directory links to the existing workspaces, not copied source trees and not published internal packages.

Implementation requirements:

- create only the three exact required links;
- fail if a conflicting non-managed path already exists;
- use a Windows directory junction when running on Windows and an equivalent directory symlink on POSIX;
- perform cleanup in `finally` so failed packing does not leave managed links behind;
- never delete or replace an unrelated pre-existing `packages/cli/node_modules` entry;
- treat link creation and cleanup as release-pack assembly behavior, not runtime behavior.

The pack step remains npm-native:

```text
npm pack --json --ignore-scripts --workspace @srdarkx/godot-mcp --pack-destination <out>
```

The packer must require npm metadata to report exactly:

```text
@godot-mcp/protocol
@godot-mcp/server
@godot-mcp/godot-addon
```

in `bundled`.

## Required tarball shape

The public release contract is one tarball:

```text
srdarkx-godot-mcp-0.1.0.tgz
```

with an installed/packed structure equivalent to:

```text
package/
+-- dist/index.js
+-- package.json
+-- README.md
+-- LICENSE
+-- node_modules/
    +-- @godot-mcp/
        +-- protocol/...
        +-- server/...
        +-- godot-addon/
            +-- addons/godot_mcp/...
```

The release packer must verify at least:

- `dist/index.js`;
- all three exact bundled package names;
- `@godot-mcp/protocol/dist/index.js`;
- `@godot-mcp/server/dist/index.js`;
- `@godot-mcp/godot-addon/addons/godot_mcp/plugin.gd`;
- `@godot-mcp/godot-addon/addons/godot_mcp/runtime/runtime_logger_46.gd.txt`;
- package README and LICENSE;
- no `.godot-mcp` project/runtime state leaks into the tarball.

Packaging fails closed if any assertion is missing.

## Lockfile handling

Do not use `npm install --package-lock-only` as the authoritative regeneration command for B2 because the npm 11.6.4 Windows repro showed an invalid workspace path resolution in this topology.

Regenerate/update the lockfile through a normal controlled install:

```powershell
npm install --ignore-scripts --no-audit --no-fund
```

`package-lock.json` remains npm-generated and must never be hand-edited.

The resulting lockfile must represent:

- root `godot-mcp-monorepo`;
- public CLI workspace `@srdarkx/godot-mcp`;
- unchanged internal workspace links;
- exact `0.1.0` internal runtime dependencies;
- bundled dependency metadata.

## Generated client configuration

The zero-friction bootstrap must generate:

```json
{
  "command": "npx",
  "args": [
    "--yes",
    "@srdarkx/godot-mcp",
    "start",
    "<absolute-project-root>",
    "--tool-profile",
    "<profile>"
  ]
}
```

The MCP server entry key may remain `godot-mcp`; only the package executed by npx changes.

No generated runtime config may reference `@godot-mcp/cli` or the occupied unscoped package `godot-mcp`.

## Workspace scripts

Every current repository script targeting the CLI workspace by package name moves from:

```text
--workspace @godot-mcp/cli
```

to:

```text
--workspace @srdarkx/godot-mcp
```

Protocol/server/addon selectors stay unchanged.

## Independent consumer acceptance

The authoritative distribution smoke starts from a new unrelated temporary consumer and receives exactly one public tarball:

```text
repository
  -> build
  -> materialize managed package-local links
  -> npm pack @srdarkx/godot-mcp
  -> cleanup managed links
  -> ONE srdarkx-godot-mcp-0.1.0.tgz
  -> fresh temporary consumer
  -> npm install <that one tarball>
  -> execute installed godot-mcp bin
  -> init fixture Godot project
  -> verify addon copied from bundled dependency
  -> verify tool profile persisted
  -> verify client config references @srdarkx/godot-mcp
  -> MCP start
  -> session.status
  -> CLI status
  -> CLI stop
```

The consumer install command must never separately install protocol, server, or godot-addon. A registry request for an internal `@godot-mcp/*` package is a genuine distribution failure.

## Dry-run publication gate

Before any real publication, validate the public workspace with a dry run appropriate for a public scoped package:

```powershell
npm publish --dry-run --access public --workspace @srdarkx/godot-mcp
```

The package-local bundled links must be materialized for this dry run using the same managed assembly helper used by packing, then cleaned afterward.

A dry run is packaging validation only; it is not publication authorization.

## Public-name boundary

The approved package identity is:

```text
@srdarkx/godot-mcp
```

A search performed during design did not surface an existing public package under this exact name, but this is not ownership proof. Before a real publish, npm authentication and ownership/control of the `srdarkx` scope must be verified explicitly.

No automatic fallback package name is authorized by this design.

## Versioning

Implementation remains `0.1.0`.

Only after the single-tarball consumer smoke, dry-run publish, build/type/unit gates, complete Windows Godot 4.6.3 runner, scope ownership verification, and explicit release approval may a separate release step bump to `0.2.0`.

## Testing strategy

Implementation follows TDD.

Regression coverage must fail when:

- root/package identities are wrong;
- the public CLI remains private;
- an internal dependency is not exactly `0.1.0`;
- `bundleDependencies` does not contain exactly the three internal packages;
- a managed package-local link cannot be safely materialized;
- cleanup leaves managed links behind after success or failure;
- npm reports a bundled set different from the exact required set;
- the tarball lacks protocol/server/addon content;
- the addon payload or runtime logger template is absent;
- generated client config references the old/unscoped package;
- a clean consumer needs a separate internal install.

Existing tool-contract, build, typecheck, unit, Godot, integration, runtime, visual, headless, and debugger gates must remain GREEN before release readiness can be claimed.

## Safety and fail-closed rules

- No source-tree fallback at runtime.
- No hidden internal package installation in the consumer.
- No `file:` dependency conversion.
- No wrapper public package.
- No JavaScript mega-bundle.
- No silent publication of internal packages.
- No overwrite of unrelated package-local `node_modules` content.
- No real npm publish, GitHub Release, push, merge, or version bump without explicit authorization.
- Stop immediately if the real packed artifact does not report and contain the exact three internal bundled dependencies.

## Acceptance criteria

1. Root package is private `godot-mcp-monorepo`.
2. `packages/cli` is the sole publishable package, named `@srdarkx/godot-mcp`.
3. Internal protocol/server/addon packages remain separate and keep their current names.
4. Their production dependency versions remain exactly `0.1.0`.
5. The public package declares exactly those three in `bundleDependencies`.
6. The release packer safely materializes package-local workspace links and always cleans them.
7. `npm pack --workspace @srdarkx/godot-mcp` reports exactly the three internal packages as bundled.
8. One public tarball physically contains all required runtime packages and addon assets.
9. A clean consumer installs only that tarball and performs no internal registry fetch.
10. Installed CLI initializes a Godot fixture and copies the addon from the bundled dependency.
11. Generated client config uses `npx --yes @srdarkx/godot-mcp start ...`.
12. MCP `session.status`, management `status`, and `stop` pass from the independent install.
13. `npm publish --dry-run --access public --workspace @srdarkx/godot-mcp` passes with the same managed bundling preparation.
14. Existing full Windows Godot 4.6.3 validation remains GREEN.
15. Implementation remains version `0.1.0` and no actual release occurs without explicit authorization.

## Decision

Preserve Option B's core architecture and adopt the B2 packaging correction: the existing CLI workspace becomes the scoped public package `@srdarkx/godot-mcp`; exact-version internal workspaces remain unchanged; and the release process temporarily materializes those workspaces as package-local links so npm's native `bundleDependencies` machinery can include them in a single public tarball.
