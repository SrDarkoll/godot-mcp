# Godot MCP

**Status: Pre-alpha / editor, runtime and file recovery milestones**

Godot MCP is an open-source MCP bridge for controlling Godot 4.x from agentic clients such as Codex. The foundation milestone establishes a standard MCP stdio server, a localhost-only Node.js ↔ Godot EditorPlugin bridge, per-project addon installation, persistent session manifests, and read-only project/scene inspection.

The editor mutation surface and persistent 2D/3D editor viewport captures are now implemented. See the [visual capture guide](docs/tools/visual-capture.md) for arguments, image delivery, session manifests and limits.

Runtime execution, inspection, native diagnostics and game screenshots are available; see the [runtime guide](docs/tools/runtime-debugger.md).

Declared-file transactions, recoverable file checkpoints and session risk/permissions are implemented; see the [recovery guide](docs/tools/transactions-recovery.md).

Risky operations use MCP host/user elicitation rather than model-replayable confirmation tokens; see the [security model](docs/tools/security.md).

Specialized `ui.*` Control layout helpers and `animation.*` AnimationMixer/AnimationPlayer editing helpers are available; see the [UI and animation power-tools guide](docs/tools/ui-animation.md). Modern `TileMapLayer` and embedded TileSet atlas helpers are also available; see the [TileMapLayer and TileSet power-tools guide](docs/tools/tilemap-tileset.md). Common 2D authoring helpers for Node2D, Sprite2D, Camera2D, CollisionShape2D and Parallax2D are documented in the [2D power-tools guide](docs/tools/2d.md). Common 3D scene authoring plus StandardMaterial3D and spatial ShaderMaterial workflows are documented in the [3D and materials power-tools guide](docs/tools/3d-materials.md). Unified 2D/3D NavigationRegion, navigation resource baking and NavigationAgent authoring are documented in the [navigation power-tools guide](docs/tools/navigation.md).

> Unsaved editor-state recovery, debugger stepping and release automation remain future milestones. Visual checkpoints index images; file checkpoints restore selected on-disk files.

## Current capabilities

- Windows-first architecture for Godot 4.x.
- Node.js 22+ TypeScript monorepo.
- Standard MCP server over stdio.
- One active Godot project/editor connection per server session.
- Authenticated WebSocket bridge bound only to `127.0.0.1`.
- Per-project `addons/godot_mcp` installation.
- Persistent `.godot-mcp/sessions/<session-id>/manifest.json`.
- Ephemeral `.godot-mcp/runtime/bridge.json` descriptor.
- MCP tools:
  - `session.status`
  - `project.info`
  - `scene.get_tree`
  - Scene, node, object, resource, script, signal, project settings/input and editor operations from Plan 2
  - `visual.capture_viewport_2d`
  - `visual.capture_viewport_3d`
  - `session.manifest`
  - `project.run`, `project.run_scene`, `project.stop`, `runtime.*` inspection/control
  - `debug.output`, `debug.errors`, `debug.warnings`, `debug.performance`
  - `visual.capture_game`
  - `transaction.*`, file `checkpoint.*`, `permissions.*` and `risk.preview`
  - `ui.*` Control layout helpers and `animation.*` AnimationMixer/AnimationPlayer editing helpers
  - `tilemap.*` TileMapLayer editing helpers and `tileset.*` embedded TileSet/atlas helpers
  - `node2d.*`, `sprite2d.*`, `camera2d.*`, `collision2d.*` and `parallax2d.*` common 2D authoring helpers
  - `node3d.*`, `mesh3d.*`, `camera3d.*`, `collision3d.*`, `light3d.*`, `material3d.*` and `shader3d.*` common 3D/material authoring helpers
  - `navigation.region.*`, `navigation.mesh.*` and `navigation.agent.*` unified 2D/3D navigation authoring and baking helpers
- CLI commands:
  - `godot-mcp init`
  - `godot-mcp doctor`

## Requirements

- Windows for the first supported development target.
- Node.js 22 or newer.
- npm.
- Godot 4.x for editor integration tests and automatic plugin enabling.

## Quick start from an existing checkout

```powershell
cd godot-mcp
npm install
npm run build

npm exec -- godot-mcp init C:\path\to\GodotProject --godot C:\path\to\Godot.exe
npm exec -- godot-mcp doctor C:\path\to\GodotProject --godot C:\path\to\Godot.exe
```

If `godot-mcp` has been linked or its local npm bin directory is already on `PATH`, the shorter form is equivalent:

```powershell
godot-mcp init C:\path\to\GodotProject --godot C:\path\to\Godot.exe
godot-mcp doctor C:\path\to\GodotProject --godot C:\path\to\Godot.exe
```

`init` copies the addon into `<project>\addons\godot_mcp`, creates `.godot-mcp/config.json`, prepares runtime/session directories, and asks Godot to enable the plugin when a Godot executable is supplied.

## Start the MCP server

After building, an MCP client should launch the server with the target Godot project:

```powershell
node .\packages\server\dist\index.js --project C:\path\to\GodotProject
```

The server owns stdout for MCP stdio. Diagnostics are written to stderr. When it starts, it creates a session manifest and a short-lived loopback bridge descriptor that the installed Godot addon discovers.

## Integration test

Without Godot configured, the integration command intentionally skips:

```powershell
npm run test:integration
# SKIP integration: GODOT_BIN is not configured
```

To make the real Godot handshake mandatory:

```powershell
$env:GODOT_BIN = "C:\Tools\Godot\Godot_v4.x-stable_win64.exe"
$env:REQUIRE_GODOT_INTEGRATION = "1"
npm run test:integration
```

The real integration test installs/enables the addon in a temporary deterministic project, opens `main.tscn` in a headless editor, waits for the authenticated bridge handshake, and verifies live `project.info` and `scene.get_tree` responses.

## Repository layout

For the native editor/game debugger tests, set `GODOT_RUNTIME_INTEGRATION=1` with `GODOT_BIN` and run `npm run test:integration:runtime`. Re-run init with `--godot` to install the development runtime autoload and compatible native logger adapter.

For real viewport rendering on Windows, set `GODOT_VISUAL_INTEGRATION=1` alongside `GODOT_BIN` and run `npm run test:integration:visual`. This tier requires graphical rendering and does not pass by skipping. `npm run check:godot` checks every addon script against the configured executable. Captures and graphical test evidence are retained locally; no automatic deletion occurs.

```text
packages/
  protocol/       Shared wire schemas and result types
  server/         MCP stdio server, sessions, bridge, read tools
  cli/            init and doctor commands
  godot-addon/    Per-project Godot 4 EditorPlugin
tests/integration/
fixtures/
docs/
```

## Foundation documentation

- [`docs/architecture/foundation.md`](docs/architecture/foundation.md)
- [`docs/protocol/foundation-rpc.md`](docs/protocol/foundation-rpc.md)
- [`docs/superpowers/specs/2026-09-05-godot-mcp-design.md`](docs/superpowers/specs/2026-09-05-godot-mcp-design.md)


## Autonomous verification

After editing a project, agents can use `workflow.run_check` to restart only a session-owned runtime, collect diagnostics/performance, capture the game viewport, and receive a deterministic `pass | fail | inconclusive` verdict plus the PNG in the same MCP response. `workflow.snapshot` creates immutable comparison baselines and `workflow.diff_since` returns only evidence created after a baseline. See [`docs/tools/workflow.md`](docs/tools/workflow.md).

## License

MIT. See [`LICENSE`](LICENSE).
