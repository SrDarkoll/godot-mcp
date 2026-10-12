# [Godot MCP on GitHub](https://github.com/SrDarkoll/godot-mcp)

Find the source code, setup guides and issue tracker in the repository. If Godot MCP helps your project, consider starring the repository.

[![npm version](https://img.shields.io/npm/v/@srdarkx/godot-mcp.svg)](https://www.npmjs.com/package/@srdarkx/godot-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Godot Engine](https://img.shields.io/badge/Godot-v4.x-478cbf?logo=godot-engine&logoColor=white)](https://godotengine.org)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-194%20Tools-8A2BE2)](https://github.com/SrDarkoll/godot-mcp)
[![Verified target](https://img.shields.io/badge/Verified-Windows%20%7C%20Godot%204.6.3-success)](https://github.com/SrDarkoll/godot-mcp)

Godot MCP connects AI assistants to Godot 4 so they can create and edit scenes, run games, debug code, and capture screenshots. The verified target is **Windows with Godot Engine 4.6.3**. Other Godot 4.x versions require their own integration checks.

Connect modern AI assistants (**Codex**, **Cursor**, **Claude Desktop**, **Antigravity**, **Roo Code**, **Cline**, and custom agents) directly to your running Godot editor and game runtime.

---

## 🚀 Quickstart: Connect Godot to your AI Assistant in 3 Steps

### Step 1: Create or Open Your Godot Project
Open Godot Engine and create a new project (e.g. `MyGame`), or open an existing project containing `project.godot`.

### Step 2: Run the Setup Command (Single Step)
Open a terminal in your project directory and run the command for your AI editor:

Codex setup is available in npm versions 0.5.1 and newer. See the [Codex setup guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/tools/codex.md) for project trust and configuration details.

Use `@latest` in the setup commands below. Without a version, npx can select an older local installation; check `npx --yes @srdarkx/godot-mcp@latest --version` if a supported client is rejected.


```bash
# For Codex
npx --yes @srdarkx/godot-mcp@latest init . --client codex

# For Google Antigravity / Gemini
npx --yes @srdarkx/godot-mcp@latest init . --client antigravity

# For Cursor
npx --yes @srdarkx/godot-mcp@latest init . --client cursor

# For Claude Desktop
npx --yes @srdarkx/godot-mcp@latest init . --client claude
```
*(Tip: You can also pass a full path instead of `.`, e.g. `npx --yes @srdarkx/godot-mcp@latest init C:\Projects\MyGame --client antigravity`)*

#### What the setup command does:
1. 🔍 **Discovers Godot**: Automatically detects your installed Godot 4.x binary across standard Windows and system paths.
2. 📦 **Installs Bridge Plugin**: Copies the hardened `addons/godot_mcp` EditorPlugin directly into your game folder.
3. ⚡ **Activates Plugin**: Enables the plugin automatically in `project.godot` (via Godot's headless CLI, no manual editor clicks needed).
4. 🤖 **Configures Your AI Client**: Automatically creates or updates `.codex/config.toml`, `.agents/mcp_config.json`, `.cursor/mcp.json`, or Claude Desktop config.

### Step 3: Open Your AI Editor and Godot
1. **Open your project in your AI editor** (**Codex**, **Antigravity**, **Cursor**, or **Claude Desktop**). Codex loads project-local configuration only when you trust the project. Restart an already-open client after changing MCP configuration.
2. **Open your project in Godot Engine**. The editor plugin connects to the bridge over local WebSocket in ~1 second.

🎉 **You're all set!** You can now prompt your AI directly:
- *"Inspect the active scene tree and add a `CharacterBody2D` with a `Sprite2D`."*
- *"Capture the 2D viewport to verify layout and shaders."*
- *"Attach the DAP debugger, set a breakpoint in `player.gd`, and step through execution."*
- *"Run headless project checks and verify zero GDScript errors."*

---

## 🛠️ CLI Commands

### `godot-mcp init [project-path]`
Initializes a Godot project for MCP connectivity.

```bash
# Auto-detect Godot and configure for Cursor
npx --yes @srdarkx/godot-mcp@latest init . --client cursor

# Specify custom Godot executable and Claude Desktop
npx --yes @srdarkx/godot-mcp@latest init C:\Projects\MyGame --godot C:\Tools\Godot_v4.6.3.exe --client claude

# Specify tool profile
npx --yes @srdarkx/godot-mcp@latest init . --client antigravity --tool-profile 2d
```

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--godot <path>` | Path to Godot 4.x executable | Auto-discovered |
| `--client <name>` | Target AI client: `codex`, `cursor`, `claude`, or `antigravity`; omit for none | None |
| `--tool-profile <profile>` | Default tool profile (`minimal`, `core`, `2d`, `3d`, `full`) | `full` |
| `--bridge-port <number>` | Custom WebSocket bridge port for start/init/upgrade; use `0` to select a free port | `0` (dynamic loopback) |

---

### `godot-mcp upgrade [project-path]`

Version 0.6.1 adds a safe upgrade flow for existing installations:

```powershell
npx --yes @srdarkx/godot-mcp@latest upgrade .
```

It preflights the installation, asks before stopping an active project session, backs up changes, migrates recognized project-local Codex launchers, installs the addon and runs `doctor`. Verification failures restore the earlier files. Other MCP entries and custom options are preserved. The command is not available in npm 0.6.0; see the [upgrade guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/upgrading.md).

Use `--yes` after `upgrade` to explicitly approve stopping the project session in automation, and `--client codex` to create Codex configuration if none exists. Reload an open Godot project and reconnect the client after success.

Starting with 0.6.2, `upgrade . --dry-run` previews the version, launcher and session changes without writing files or stopping the server. Verified source-checkout servers and Node scripts followed by a verified Godot MCP server entry can be migrated with one interactive confirmation. For automation, `--replace-launcher` separately approves replacing custom launcher behavior; `--yes` alone does not. See the [upgrade guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/upgrading.md#custom-launchers-and-upgrade-preview).

### Update reminders

Starting with 0.6.3, Windows CRLF launcher migration, linked CLI/server startup, incomplete addon detection and invalid configuration fields are handled directly. New installations use automatic loopback ports; `upgrade . --bridge-port 0` explicitly changes an older fixed-port project with backup/rollback. For non-Git Godot projects, `setup codex . --register-project-root` adds the Godot root marker to Codex user settings while retaining other configuration. Plain `setup codex` stays read-only.

Starting with 0.6.3, automatic update notices appear on CLI stderr without changing JSON output, at most once a day per installed/latest version pair. MCP callers receive one notice per new version in the next tool response after the background check finishes; the assistant can relay it to the user. Versions 0.6.2 and earlier need one initial upgrade before they can provide these notices.

The notice includes `npx --yes @srdarkx/godot-mcp@latest upgrade .` for the Godot project, plus `npm install -g @srdarkx/godot-mcp@latest` for a global CLI or `npm install @srdarkx/godot-mcp@latest` for a local dependency. Updating npm alone does not update an addon or a pinned client launcher. Reload the addon and reconnect after upgrading each project; recognized project-local Codex entries are migrated automatically.

Checks use anonymous public npm metadata, a one-second request deadline and a daily cache. Offline failures are ignored, with a one-hour retry interval. Nothing updates automatically. Set `GODOT_MCP_UPDATE_CHECK=0` to disable notices; CI, Vitest and npm offline mode also disable them. See [update notices](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/upgrading.md#update-notices) for cache locations and client configuration.

### `godot-mcp run [options]`
Launches the MCP server over stdio for AI client consumption.

Starting with 0.6.3, Codex tool discovery and multiple chats can connect to one project session. Clients share the editor bridge and runtime, with separate MCP connections, tool profiles and approvals. Closing one client leaves the others connected. An older running server needs one restart during upgrade to load this behavior.

```bash
npx --yes @srdarkx/godot-mcp@latest run --project C:\Projects\MyGame --tool-profile full
```

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--project <path>` | Path to Godot project folder containing `project.godot` | Current directory |
| `--tool-profile <name>` | Active tool profile (`minimal`, `core`, `2d`, `3d`, `runtime`, `full`) | `full` |

---

### `godot-mcp doctor [project-path]`
Runs comprehensive diagnostic checks on your environment, permissions, Godot executable, and bridge status.

```bash
npx --yes @srdarkx/godot-mcp@latest doctor .
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
npx --yes @srdarkx/godot-mcp@latest config .

# Repair corrupted or invalid configuration
npx --yes @srdarkx/godot-mcp@latest config . --repair
```

---

## 🤖 AI Client Configurations

### Codex (`.codex/config.toml`)

`init --client codex` writes a managed, project-local TOML entry while preserving other settings:

```toml
[mcp_servers.godot-mcp]
command = "npx"
args = ["--yes", "@srdarkx/godot-mcp@0.6.3", "start", "C:/path/to/YourProject", "--tool-profile", "full"]
```

Trust the project in Codex and restart the local client after configuration changes. From that project, `codex mcp get godot-mcp --json` shows the configured launch command and project path; `/mcp` shows the active connection. The source checkout also offers `godot-mcp setup codex` as a read-only recipe for launching its compiled server during development. See the [Codex setup guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/tools/codex.md) and [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp).

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "godot": {
      "command": "npx",
      "args": [
        "-y",
        "@srdarkx/godot-mcp@0.6.3",
        "run",
        "--project",
        "C:/path/to/YourProject"
      ]
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "godot": {
      "command": "npx",
      "args": [
        "-y",
        "@srdarkx/godot-mcp@0.6.3",
        "run",
        "--project",
        "C:\\path\\to\\YourProject",
        "--tool-profile",
        "full"
      ]
    }
  }
}
```

---

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
| `full` | 194 | Unrestricted | All available Godot MCP tools (default) |

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
