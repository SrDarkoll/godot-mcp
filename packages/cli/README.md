# [Godot MCP on GitHub](https://github.com/SrDarkoll/godot-mcp)

Find the source code, setup guides and issue tracker in the repository. If Godot MCP helps your project, consider starring the repository.

[![npm version](https://img.shields.io/npm/v/@srdarkx/godot-mcp.svg)](https://www.npmjs.com/package/@srdarkx/godot-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Godot Engine](https://img.shields.io/badge/Godot-v4.x-478cbf?logo=godot-engine&logoColor=white)](https://godotengine.org)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-194%20Tools-8A2BE2)](https://github.com/SrDarkoll/godot-mcp)
[![Verified target](https://img.shields.io/badge/Verified-Windows%20%7C%20Godot%204.6.3-success)](https://github.com/SrDarkoll/godot-mcp)

Godot MCP connects AI assistants to Godot 4 so they can create and edit scenes, run games, debug code, and capture screenshots. The verified target is **Windows with Godot Engine 4.6.3**. Other Godot 4.x versions require their own integration checks.

Automatic setup targets **Codex**, **Cursor**, **Claude Desktop** and **Antigravity**. Gemini CLI, Roo Code, Cline and other local STDIO clients use the [manual client guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/tools/clients.md#manual-clients).

---

## Current release: 0.6.5

The public package, server and addon use **0.6.5**, with **protocol 1** and **194 tools**. This release removes redundant approvals from routine project settings and headless work, saves named scenes before closing them, and inspects fresh GDScript source without reloading live instances. Destructive operations remain protected.

It also retains the complete Windows runtime bundle introduced in 0.6.4. See the [0.6.5 release notes](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/releases/0.6.5.md), [0.6.4 release notes](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/releases/0.6.4.md) and [changelog](https://github.com/SrDarkoll/godot-mcp/blob/main/CHANGELOG.md).

To update, run these commands from **each Godot project folder**:

```powershell
npm install -g @srdarkx/godot-mcp@latest
godot-mcp upgrade --dry-run
godot-mcp upgrade
godot-mcp doctor
```

Updating npm alone does not update project addons or pinned launchers. `upgrade` migrates recognized Codex entries. For Cursor, Antigravity or Claude Desktop, also rerun the matching `godot-mcp init --client <name>` after upgrading and before reconnecting. Reload the Godot addon and reconnect the client. See the [client guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/tools/clients.md).

---

## Setup

### 1. Create the project in Godot

Create or open your game in Godot, then close the editor while you install the addon.

### 2. Install the command once

With Node.js 22+ installed, open CMD or PowerShell and run:

```powershell
npm install -g @srdarkx/godot-mcp@latest
```

### 3. Open a terminal in your project folder

In File Explorer, open the folder containing `project.godot`. Right-click inside the folder and select **Open in Terminal**, or open CMD/PowerShell there.

### 4. Configure your client

Run the command for the client you use:

| Client | Command |
| --- | --- |
| Codex | `godot-mcp init --client codex` |
| Cursor | `godot-mcp init --client cursor` |
| Antigravity | `godot-mcp init --client antigravity` |
| Claude Desktop | `godot-mcp init --client claude` |

For Gemini CLI, Roo Code or Cline, follow the [client guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/tools/clients.md#manual-clients).

### 5. Open your AI client

- **Codex:** add the project folder and mark it as trusted.
- **Cursor or Antigravity:** open the project folder and enable Godot MCP in the client's MCP settings if prompted.
- **Claude Desktop:** completely quit and reopen the app.

If the client was already open during installation, reload its MCP connection or restart it.

### 6. Reopen the project in Godot

Open the same `project.godot` you used in step 3. The client starts the MCP server automatically.

### 7. Check the connection

Start a chat in your AI client and send:

> Use Godot MCP to check the connection. Show me the project path and whether the Godot editor is connected. Do not modify the project.

The path should match your project and the editor should be connected. You can then start working on the game.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `godot-mcp` is not recognized | Reopen the terminal after step 2. If it still fails, check npm's global executable directory is on PATH. |
| `project.godot` is missing | Open the terminal in the folder containing that file, or pass the project path to `init`. |
| Godot executable not detected | Add `--godot "C:\Tools\Godot.exe"` to your setup command, using your executable's path. |
| Editor disconnected | Reload the client and reopen the same Godot project; check addon warnings and live status. |
| Codex selects another project | For projects without Git, run `godot-mcp setup codex --register-project-root` and reconnect Codex. This updates Codex user configuration with a backup; see the [Codex guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/tools/codex.md). |
| Runtime disconnected | Expected before a scene is running. Use F6 to run a scene; F5 requires a main scene. |

For a diagnostic report, run `godot-mcp doctor` in the project folder. Godot itself can be installed elsewhere; the project folder is identified by `project.godot`.

### Without global installation

Use `npx` instead:

```powershell
npx --yes @srdarkx/godot-mcp@latest init --client codex
npx --yes @srdarkx/godot-mcp@latest doctor
```

Replace `codex` with your client name, then continue at step 5.

---

## 🛠️ CLI Commands

### `godot-mcp init [project-path]`
Initializes a Godot project for MCP connectivity.

```bash
# Auto-detect Godot and configure for Cursor
godot-mcp init --client cursor

# Specify custom Godot executable and Claude Desktop
godot-mcp init "C:\Projects\MyGame" --godot "C:\Tools\Godot_v4.6.3.exe" --client claude

# Specify tool profile
godot-mcp init --client antigravity --tool-profile 2d
```

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--godot <path>` | Path to Godot 4.x executable | Auto-discovered |
| `--client <name>` | Target AI client: `codex`, `cursor`, `claude`, or `antigravity`; omit for none | None |
| `--tool-profile <profile>` | Default tool profile (`minimal`, `core`, `2d`, `3d`, `full`) | `full` |
| `--bridge-port <number>` | Custom WebSocket bridge port for start/init/upgrade; use `0` to select a free port | `0` (dynamic loopback) |

---

### `godot-mcp upgrade [project-path]`

Use the safe upgrade flow for existing installations:

```powershell
godot-mcp upgrade
```

It preflights the installation, asks before stopping an active project session, backs up changes, migrates recognized project-local Codex launchers, installs the addon and runs `doctor`. Verification failures restore the earlier files. Other MCP entries and custom options are preserved. The command is not available in npm 0.6.0; see the [upgrade guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/upgrading.md).

Use `--yes` after `upgrade` to explicitly approve stopping the project session in automation, and `--client codex` to create Codex configuration if none exists. Reload an open Godot project and reconnect the client after success.

Starting with 0.6.2, `upgrade . --dry-run` previews the version, launcher and session changes without writing files or stopping the server. Verified source-checkout servers and Node scripts followed by a verified Godot MCP server entry can be migrated with one interactive confirmation. For automation, `--replace-launcher` separately approves replacing custom launcher behavior; `--yes` alone does not. See the [upgrade guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/upgrading.md#custom-launchers-and-upgrade-preview).

### Update reminders

Starting with 0.6.3, Windows CRLF launcher migration, linked CLI/server startup, incomplete addon detection and invalid configuration fields are handled directly. New installations use automatic loopback ports; `upgrade . --bridge-port 0` explicitly changes an older fixed-port project with backup/rollback. For non-Git Godot projects, `setup codex . --register-project-root` adds the Godot root marker to Codex user settings while retaining other configuration. Plain `setup codex` stays read-only.

Starting with 0.6.3, automatic update notices appear on CLI stderr without changing JSON output, at most once a day per installed/latest version pair. MCP callers receive one notice per new version in the next tool response after the background check finishes; the assistant can relay it to the user. Versions 0.6.2 and earlier need one initial upgrade before they can provide these notices.

The notice includes the explicit latest-package upgrade command, plus `npm install -g @srdarkx/godot-mcp@latest` for a global CLI or `npm install @srdarkx/godot-mcp@latest` for a local dependency. After updating a global CLI, use `godot-mcp upgrade` in each project. npm alone does not update addons or pinned launchers; refresh JSON client entries with their `init --client` command before reconnecting. Recognized project-local Codex entries are migrated automatically.

Checks use anonymous public npm metadata, a one-second request deadline and a daily cache. Offline failures are ignored, with a one-hour retry interval. Nothing updates automatically. Set `GODOT_MCP_UPDATE_CHECK=0` to disable notices; CI, Vitest and npm offline mode also disable them. See [update notices](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/upgrading.md#update-notices) for cache locations and client configuration.

### `godot-mcp start [project-path]`
Launches the MCP server over stdio for AI client consumption. The AI client normally runs this for you; it is not an extra installation step. `run --project <path>` remains an alias.

Starting with 0.6.3, Codex tool discovery and multiple chats can connect to one project session. Clients share the editor bridge and runtime, with separate MCP connections, tool profiles and approvals. Closing one client leaves the others connected. An older running server needs one restart during upgrade to load this behavior.

```bash
godot-mcp start "C:\Projects\MyGame" --tool-profile full
```

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--project <path>` | Path to Godot project folder containing `project.godot` | Current directory |
| `--tool-profile <name>` | Active tool profile (`minimal`, `core`, `2d`, `3d`, `runtime`, `full`) | `full` |

---

### `godot-mcp doctor [project-path]`
Runs comprehensive diagnostic checks on your environment, permissions, Godot executable, and bridge status.

```bash
godot-mcp doctor
```

Verifies:
- Node.js runtime version (>= 22 required)
- Godot 4.x binary detection and execution capability
- Project structure (`project.godot` and `res://` layout)
- Addon installation integrity and SHA-256 manifest
- Plugin activation in `project.godot`
- Loopback WebSocket port availability

---

### `godot-mcp config [project-path] [options]`
Inspects or repairs the `.godot-mcp/config.json` project configuration.

```bash
# Inspect current configuration
godot-mcp config

# Repair corrupted or invalid configuration
godot-mcp config --repair
```

---

## 🤖 AI Client Configurations

### Codex (`.codex/config.toml`)

`init --client codex` writes a managed, project-local TOML entry while preserving other settings. Generated launchers pin the installed version so the server and addon remain aligned; the current release produces:

```toml
[mcp_servers.godot-mcp]
command = "npx"
args = ["--yes", "@srdarkx/godot-mcp@0.6.5", "start", "C:/path/to/YourProject", "--tool-profile", "full"]
```

Trust the project in Codex and restart the local client after configuration changes. From that project, `codex mcp get godot-mcp --json` shows the configured launch command and project path; `/mcp` shows the active connection. The source checkout also offers `godot-mcp setup codex` as a read-only recipe for launching its compiled server during development. See the [Codex setup guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/tools/codex.md) and [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp).

### Cursor (`.cursor/mcp.json`)

`godot-mcp init --client cursor` writes a project-local entry. Open the same workspace and reload/enable the server in Cursor. See [Cursor's official MCP configuration](https://cursor.com/docs/mcp).

```json
{
  "mcpServers": {
    "godot-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "--yes",
        "@srdarkx/godot-mcp@0.6.5",
        "start",
        "C:/path/to/YourProject",
        "--tool-profile",
        "full"
      ]
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

`godot-mcp init --client claude` writes Windows `%APPDATA%\Claude\claude_desktop_config.json`. Completely quit and reopen Desktop and inspect its Developer/Connectors status. This is local STDIO, not a remote connector or Claude Code setup. See [Anthropic's guide](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) and the [official local-server example](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

The managed Desktop entry is global: initializing another Godot project replaces its fixed target with a backup. It does not follow the active Godot window. Use separately named manual entries for simultaneous projects and verify each tool's project path.

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": [
        "--yes",
        "@srdarkx/godot-mcp@0.6.5",
        "start",
        "C:\\path\\to\\YourProject",
        "--tool-profile",
        "full"
      ]
    }
  }
}
```

---

### Antigravity and manual clients

`godot-mcp init --client antigravity` writes workspace `.agents/mcp_config.json`. Reload it through Antigravity's MCP manager; see [Google's official guide](https://antigravity.google/docs/mcp).

Antigravity and Gemini CLI are different clients. Gemini CLI, Roo Code and Cline require [manual local STDIO configuration](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/tools/clients.md#manual-clients). The guide includes official references, per-client activation and verification limits. No `--client gemini`, `--client cline` or `--client roo` flag is implemented.

## 🎯 194 Tools Across 8 Profiles

Godot MCP exposes **194 MCP tools** partitioned into 8 profiles to optimize AI context window tokens:

| Profile | Tools | Focus | Key Capabilities |
| :--- | :---: | :--- | :--- |
| `minimal` | 5 | Liveness | Status, project info, scene tree, engine capabilities, tool registry |
| `core` | 86 | Project & Scenes | Nodes, resources, scene batches, geometry validation, dependencies, events, transactions |
| `2d` | 130 | 2D Games | Core + Node2D, Sprite2D, TileMapLayer, TileSet, Camera2D, Collision2D |
| `3d` | 115 | 3D Worlds | Core + Node3D, Mesh3D, Camera3D, Lights, Materials, Shaders |
| `navigation` | 75 | Pathfinding | Core + 2D/3D NavigationRegion, NavigationMesh baking, NavigationAgent |
| `ui` | 89 | UI & Animation | Core + Control nodes, anchors, layouts, AnimationPlayer & AnimationMixer |
| `runtime` | 53 | QA & Debug | Headless runner, events, retained capture lookup, live inspection, DAP debugger |
| `full` | 194 | Complete | All available Godot MCP tools (default); permissions still apply |

---

## 🛡️ Enterprise Hardening & Safety

Godot MCP provides guarded operations for AI-assisted editing:

- **Kernel-Level Project Lease**: Windows Named Pipes (`\\.\pipe\godot-mcp-project-<sha256>`) prevent concurrent conflicting processes. Instant kernel cleanup if a process terminates abnormally.
- **Addon Journal & Rollback**: Addon updates are staged in `.godot-mcp/addon-backups/` with SHA-256 verification and journal markers. Startup attempts to roll back interrupted updates and stops if recovery cannot be verified.
- **Defensive Serialization Budgets**: Bound recursion (64 depth), item count (50,000) and strings (8 MB), with cycle detection via `WeakSet`.
- **Reflection Guard**: Blocks 31 dangerous reflective methods (`call_thread_safe`, `emit_signal`, etc.) and restricts node mutations to the active edited scene tree.
- **Recoverable Multi-File Transactions**: Stage declared file edits, verify preconditions and publish them sequentially with a journal and compensation. Other processes can observe intermediate writes; failed compensation leaves a journal requiring recovery.
- **Interactive DAP Debugger**: Live breakpoint management, call stack inspection, lazy variable evaluation, and stepping (into, over, out) during runtime execution.
- **Visual and Geometry Checks**: Capture 2D/3D editor viewports or a temporary close-up of a running game, resolve captures across sessions and validate walkway footprints against declared collisions before running.

---

## 📋 Requirements

- **Node.js**: `v22.0.0` or newer
- **Godot Engine**: `4.6.3-stable` verified on Windows; other 4.x versions require integration validation.
- **OS**: Windows 10/11. The current project lease returns `UNSUPPORTED_PLATFORM` on Linux and macOS.

---

## 📄 License & Links

- **Repository**: [https://github.com/SrDarkoll/godot-mcp](https://github.com/SrDarkoll/godot-mcp)
- **Issues**: [https://github.com/SrDarkoll/godot-mcp/issues](https://github.com/SrDarkoll/godot-mcp/issues)
- **License**: MIT © [SrDarkoll](https://github.com/SrDarkoll)
