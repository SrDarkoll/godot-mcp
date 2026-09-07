# Godot MCP

[![Windows Validation](https://github.com/SrDarkoll/godot-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/SrDarkoll/godot-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Godot Engine](https://img.shields.io/badge/Godot-v4.6.3--stable-478cbf?logo=godot-engine&logoColor=white)](https://godotengine.org)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-183%20Tools-8A2BE2)](docs/architecture/tool-registry-profiles.md)
[![Status](https://img.shields.io/badge/Status-Developer%20Preview%20%7C%20Phase%209%20GREEN-success)](#authoritative-validation-evidence)

**Status: Developer Preview — Phase 9 (Advanced Debugging & Headless Process Manager)**

Godot MCP is an open-source Model Context Protocol (MCP) bridge for controlling Godot 4.x from agentic AI assistants (such as Antigravity, Claude, Codex, and others). It enables agents to inspect, author, debug, simulate, and visually verify Godot games directly through standard MCP tool invocations.

---

## Authoritative Validation Evidence

Godot MCP enforces rigorous end-to-end testing against live Godot 4.6.3 on Windows across 10 deterministic validation gates:

| Scope | Metrics | Status |
| :--- | :--- | :---: |
| **Tool Surface** | 183 canonical MCP tools across 8 profiles (`minimal`, `core`, `2d`, `3d`, `navigation`, `ui`, `runtime`, `full`) | ✅ PASS |
| **Protocol Unit Tests** | 52/52 tests passed (`@godot-mcp/protocol`) | ✅ PASS |
| **Server Unit Tests** | 250/250 tests passed (`@godot-mcp/server`) | ✅ PASS |
| **CLI Unit Tests** | 11/11 tests passed (`@godot-mcp/cli`) | ✅ PASS |
| **General Integration** | 15 test files (16 tests) driving live Godot 4.x EditorPlugin mutation lifecycle | ✅ PASS |
| **Runtime Integration** | 3 test files (10 tests) controlling live game execution, inspection & native diagnostics | ✅ PASS |
| **Visual Integration** | 1 test file (2 tests) capturing real 2D & 3D viewport pixels with checksum validation | ✅ PASS |
| **Phase 8 Headless** | 1 test file (1 test) validating autonomous headless project management without editor | ✅ PASS |
| **Phase 9 DAP Debugger** | 1 test file (2 tests) validating DAP stack, variables, stepping, breakpoints & reapply | ✅ PASS |
| **Tool Contracts** | 183/183 tools verified against canonical JSON schemas with zero drift | ✅ PASS |

---

## Current capabilities

- Windows-first architecture for Godot 4.x.
- Node.js 22+ TypeScript monorepo.
- Standard MCP server over stdio.
- One active Godot project/editor connection per server session.
- Authenticated WebSocket bridge bound only to `127.0.0.1`.
- Per-project `addons/godot_mcp` installation.
- Persistent `.godot-mcp/sessions/<session-id>/manifest.json`.
- Ephemeral `.godot-mcp/runtime/bridge.json` descriptor.
- True Headless Process Manager for autonomous validation, asset importing, script testing, and background execution without GUI dependency.
- Advanced Interactive DAP Debugging: breakpoints, stepping, stack frame inspection, lazy variable expansion, and breakpoint sync.
- Real-time Visual Viewport & Game Captures (2D & 3D editor viewports, game runtime capture).
- Declared-file transactions, recoverable file checkpoints, and session risk/permissions (`transaction.*`, `checkpoint.*`, `permissions.*`).
- MCP tools (183 tools organized in profiles):
  - `session.status`, `godot.capabilities`, `godot.tools` (bounded tool/profile discovery)
  - `project.info`, `scene.get_tree`
  - Scene, node, object, resource, script, signal, project settings/input and editor operations
  - `visual.capture_viewport_2d`, `visual.capture_viewport_3d`, `visual.capture_game`
  - `headless.validate_project`, `headless.import`, `headless.run`, `headless.run_scene`, `headless.run_tests`, `headless.status`, `headless.stop`, `headless.get_output`
  - `project.run`, `project.run_scene`, `project.stop`, `runtime.*` inspection/control
  - `debug.output`, `debug.errors`, `debug.warnings`, `debug.performance`
  - Advanced DAP Debugger: `debug.breakpoint.set`, `debug.breakpoint.remove`, `debug.breakpoint.list`, `debug.stack`, `debug.variables`, `debug.expand`, `debug.continue`, `debug.step_into`, `debug.step_over`, `debug.step_out`
  - `transaction.*`, file `checkpoint.*`, `permissions.*` and `risk.preview`
  - `ui.*` Control layout helpers and `animation.*` AnimationMixer/AnimationPlayer editing helpers
  - `tilemap.*` TileMapLayer editing helpers and `tileset.*` embedded TileSet/atlas helpers
  - `node2d.*`, `sprite2d.*`, `camera2d.*`, `collision2d.*` and `parallax2d.*` common 2D authoring helpers
  - `node3d.*`, `mesh3d.*`, `camera3d.*`, `collision3d.*`, `light3d.*`, `material3d.*` and `shader3d.*` common 3D/material authoring helpers
  - `navigation.region.*`, `navigation.mesh.*` and `navigation.agent.*` unified 2D/3D navigation authoring and baking helpers
- CLI commands:
  - `godot-mcp init`
  - `godot-mcp doctor`
  - `godot-mcp config`

> Visual checkpoints index images; file checkpoints restore selected on-disk files. Release automation and unsaved live-memory crash recovery remain future roadmap items.

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

Tool exposure defaults to the complete `full` profile. Persist a narrower surface with `godot-mcp config <project> --tool-profile 3d`, or pass `--tool-profile minimal|core|2d|3d|navigation|ui|runtime|full` to `start`/the server for a one-session override. Profiles are fixed for the lifetime of the server.

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
