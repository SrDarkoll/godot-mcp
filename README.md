# Godot MCP

Godot MCP connects an MCP client to the Godot editor through a project-local addon. It uses standard MCP over stdio and an authenticated localhost bridge. Editing and captures use Godot APIs, without simulated keyboard or mouse input.

**Status: advanced pre-alpha, under stabilization.** The supported validation target is Windows, Node 22 and Godot 4.6.3. This is not an OS sandbox for project scripts. The [audit execution plan](docs/superpowers/plans/2026-09-07-audit-remediation.md) distinguishes completed work from pending enhancements.

## Implemented

- Inspect and edit scenes, nodes, resources, scripts, signals, settings and input actions; use editor undo/redo where supported.
- Capture editor 2D/3D viewports and the owned running game's viewport; retain PNGs and session manifests.
- Start/stop/restart an owned game, pause/resume its SceneTree, inspect runtime nodes and query bounded native diagnostics/performance.
- Stage declared file transactions, preview hashes, validate publication, compensate failures and recover retained snapshots after crashes.
- Preview bounded, optionally redacted transaction diffs and validate retained project copies with headless Godot.
- Apply prevalidated scene/resource batches as one Undo action, consume bounded project events, inspect dependencies/imports, and compare retained visuals/performance.
- Enforce session permissions, exact single-use confirmations, scoped reflection and explicit trust for custom script methods.
- Diagnose/configure projects, inspect retained sessions, safely update the addon, and build installable tarballs.
- Query bounded tool latency, failures, queue/memory/storage metrics and export hashed session evidence with explicit artifact inclusion.

The generated [tool catalog](docs/tools/catalog.md) and [actual input schemas](docs/tools/catalog.json) are authoritative. `risk.preview` evaluates exact arguments; baseline risk can escalate for overwrites and other sensitive operations.

## From a checkout

```powershell
npm ci
npm run build
node packages/cli/dist/index.js init C:\Games\Example --godot C:\Tools\Godot_v4.6.3-stable_win64.exe
node packages/cli/dist/index.js doctor C:\Games\Example --json
```

Open that project in Godot. Configure your MCP client to launch:

```powershell
node C:\path\to\godot-mcp\packages\cli\dist\index.js start C:\Games\Example
```

The start command owns stdout for MCP; do not wrap it in a script that prints status messages. For a Codex configuration recipe, run `node packages/cli/dist/index.js setup codex C:\Games\Example`. This prints configuration without changing the user's profile.

## Operation

```powershell
node packages/cli/dist/index.js status C:\Games\Example --json
node packages/cli/dist/index.js permissions C:\Games\Example --json
node packages/cli/dist/index.js sessions list C:\Games\Example --json
node packages/cli/dist/index.js stop C:\Games\Example --json
node packages/cli/dist/index.js addon update C:\Games\Example --godot C:\Tools\Godot_v4.6.3-stable_win64.exe
```

Stop the MCP server before addon maintenance. A project lease prevents concurrent cooperating servers/updaters. Pending recovery journals block conflicting operations. If config.json is damaged, status/stop remain available; [explicit repair](docs/tools/cli-config-repair.md) retains its original bytes.

## Guarantees and limits

Captures and recovery evidence are retained under `.godot-mcp/`; they are not automatically deleted. Do not publish bridge descriptors, local configuration, private project files or unreviewed session logs. The bridge token grants local session access.

Transactions operate on declared on-disk files, not unsaved editor state. Close scene tabs and affected editors before file publication. Recovery is not atomically visible to arbitrary external writers; see [maintenance and isolation](docs/tools/project-maintenance.md). Custom scripts are trusted code and can have effects outside tool permission classifications; see [reflection safety](docs/tools/reflection-safety.md) and [SECURITY.md](SECURITY.md).

Native diagnostics are bounded and can be incomplete; this is reported in results. A manually started game is not silently adopted or stopped. Graphical captures require a graphical session and usable renderer; headless jobs exercise different checks.

## Development and delivery

```powershell
npm test
npm run typecheck
npm run check:catalog
$env:GODOT_BIN = 'C:\Tools\Godot_v4.6.3-stable_win64.exe'
npm run check:godot
npm run test:integration
npm run test:distribution
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [compatibility](docs/compatibility.md), [installation](docs/installation.md), [release procedure](docs/releasing.md) and [CHANGELOG.md](CHANGELOG.md). Local validation does not imply a remote CI run or a published release. Packages currently remain private npm workspaces; distribution uses reviewed tarballs.
