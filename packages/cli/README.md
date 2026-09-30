# @srdarkx/godot-mcp

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


```bash
# For Codex
npx @srdarkx/godot-mcp init . --client codex

# For Google Antigravity / Gemini
npx @srdarkx/godot-mcp init . --client antigravity

# For Cursor
npx @srdarkx/godot-mcp init . --client cursor

# For Claude Desktop
npx @srdarkx/godot-mcp init . --client claude
```
*(Tip: You can also pass a full path instead of `.`, e.g. `npx @srdarkx/godot-mcp init C:\Projects\MyGame --client antigravity`)*

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
npx @srdarkx/godot-mcp init . --client cursor

# Specify custom Godot executable and Claude Desktop
npx @srdarkx/godot-mcp init C:\Projects\MyGame --godot C:\Tools\Godot_v4.6.3.exe --client claude

# Specify tool profile
npx @srdarkx/godot-mcp init . --client antigravity --tool-profile 2d
```

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--godot <path>` | Path to Godot 4.x executable | Auto-discovered |
| `--client <name>` | Target AI client: `codex`, `cursor`, `claude`, or `antigravity`; omit for none | None |
| `--tool-profile <profile>` | Default tool profile (`minimal`, `core`, `2d`, `3d`, `full`) | `full` |
| `--port <number>` | Custom WebSocket bridge port | `0` (dynamic loopback) |

---

### `godot-mcp run [options]`
Launches the MCP server over stdio for AI client consumption.

```bash
npx @srdarkx/godot-mcp run --project C:\Projects\MyGame --tool-profile full
```

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--project <path>` | Path to Godot project folder containing `project.godot` | Current directory |
| `--tool-profile <name>` | Active tool profile (`minimal`, `core`, `2d`, `3d`, `runtime`, `full`) | `full` |

---

### `godot-mcp doctor [project-path]`
Runs comprehensive diagnostic checks on your environment, permissions, Godot executable, and bridge status.

```bash
npx @srdarkx/godot-mcp doctor .
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
npx @srdarkx/godot-mcp config .

# Repair corrupted or invalid configuration
npx @srdarkx/godot-mcp config . --repair
```

---

## 🤖 AI Client Configurations

### Codex (`.codex/config.toml`)

`init --client codex` writes a managed, project-local TOML entry while preserving other settings:

```toml
[mcp_servers.godot-mcp]
command = "npx"
args = ["--yes", "@srdarkx/godot-mcp", "start", "C:/path/to/YourProject", "--tool-profile", "full"]
```

Trust the project in Codex and restart the local client. `codex mcp list` or `/mcp` shows the connection. The source checkout also offers `godot-mcp setup codex` as a read-only recipe for launching its compiled server during development. See the [Codex setup guide](https://github.com/SrDarkoll/godot-mcp/blob/main/docs/tools/codex.md) and [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp).

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "godot": {
      "command": "npx",
      "args": [
        "-y",
        "@srdarkx/godot-mcp",
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
        "@srdarkx/godot-mcp",
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
