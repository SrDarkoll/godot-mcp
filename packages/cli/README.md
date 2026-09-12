# @srdarkx/godot-mcp

[![npm version](https://img.shields.io/npm/v/@srdarkx/godot-mcp.svg)](https://www.npmjs.com/package/@srdarkx/godot-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Godot Engine](https://img.shields.io/badge/Godot-v4.x-478cbf?logo=godot-engine&logoColor=white)](https://godotengine.org)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-192%20Tools-8A2BE2)](https://github.com/SrDarkoll/godot-mcp)
[![Status](https://img.shields.io/badge/Status-Stable%20%7C%20Production--Ready-success)](https://github.com/SrDarkoll/godot-mcp)

The official CLI launcher and Model Context Protocol bridge for **Godot Engine 4.x**.

Connect modern AI assistants (**Cursor**, **Claude Desktop**, **Antigravity**, **Roo Code**, **Cline**, and custom agents) directly to your running Godot editor and game runtime.

---

## 🚀 Quickstart: Connect Godot to your AI Assistant in 3 Steps

### Step 1: Create or Open Your Godot Project
Open Godot Engine and create a new project (e.g. `MyGame`), or open an existing project containing `project.godot`.

### Step 2: Run the Setup Command (Single Step)
Open a terminal in your project directory and run the command for your AI editor:

```bash
# For Google Antigravity / Gemini
npx @srdarkx/godot-mcp init . --client antigravity

# For Cursor
npx @srdarkx/godot-mcp init . --client cursor

# For Claude Desktop
npx @srdarkx/godot-mcp init . --client claude
```
*(Tip: You can also pass a full path instead of `.`, e.g. `npx @srdarkx/godot-mcp init C:\Projects\MyGame --client antigravity`)*

#### What happens automatically in 3 seconds:
1. 🔍 **Discovers Godot**: Automatically detects your installed Godot 4.x binary across standard Windows and system paths.
2. 📦 **Installs Bridge Plugin**: Copies the hardened `addons/godot_mcp` EditorPlugin directly into your game folder.
3. ⚡ **Activates Plugin**: Enables the plugin automatically in `project.godot` (via Godot's headless CLI, no manual editor clicks needed).
4. 🤖 **Configures Your AI Client**: Automatically creates or updates your client configuration file (`.agents/mcp_config.json`, `.cursor/mcp.json`, or Claude Desktop config).

### Step 3: Open Your AI Editor and Godot
1. **Open your project in your AI editor** (**Antigravity**, **Cursor**, or **Claude Desktop**). It will detect the configuration and launch the Godot MCP server automatically. (If already open, simply reload the window).
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
| `--client <name>` | Target AI client: `cursor`, `claude`, `antigravity`, `none` | Prompt / Auto |
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

## 🎯 192 Tools Across 8 Profiles

Godot MCP exposes **192 MCP tools** partitioned into 8 profiles to optimize AI context window tokens:

| Profile | Tools | Focus | Key Capabilities |
| :--- | :---: | :--- | :--- |
| `minimal` | 5 | Liveness | Status, project info, scene tree, engine capabilities, tool registry |
| `core` | 84 | Project & Scenes | Nodes, resources, scene batches, dependencies, events, transactions |
| `2d` | 128 | 2D Games | Core + Node2D, Sprite2D, TileMapLayer, TileSet, Camera2D, Collision2D |
| `3d` | 114 | 3D Worlds | Core + Node3D, Mesh3D, Camera3D, Lights, Materials, Shaders |
| `navigation` | 73 | Pathfinding | Core + 2D/3D NavigationRegion, NavigationMesh baking, NavigationAgent |
| `ui` | 88 | UI & Animation | Core + Control nodes, anchors, layouts, AnimationPlayer & AnimationMixer |
| `runtime` | 52 | QA & Debug | Headless runner, events, visual/performance comparison, live inspection, DAP debugger |
| `full` | 192 | Unrestricted | All available Godot MCP tools (default) |

---

## 🛡️ Enterprise Hardening & Safety

Godot MCP is engineered for safe, autonomous AI pair-programming:

- **Kernel-Level Project Lease**: Windows Named Pipes (`\\.\pipe\godot-mcp-project-<sha256>`) prevent concurrent conflicting processes. Instant kernel cleanup if a process terminates abnormally.
- **Addon Journal & Rollback**: Addon updates are staged in `.godot-mcp/addon-backups/` with SHA-256 verification and atomic markers. Interruptions are automatically rolled back.
- **Defensive Serialization Budgets**: Prevents engine hangs and OOM crashes with recursion bounds (64 depth, 50,000 items, 8 MB strings, cycle detection via `WeakSet`).
- **Reflection Safety & Sandbox**: Blocks 31 dangerous reflective methods (`call_thread_safe`, `emit_signal`, etc.) and restricts node mutations to the active edited scene tree.
- **Atomic Multi-File Transactions**: Stage multiple file edits in memory. If any operation fails, the entire transaction is reverted with zero partial writes.
- **Interactive DAP Debugger**: Live breakpoint management, call stack inspection, lazy variable evaluation, and stepping (into, over, out) during runtime execution.
- **Multimodal Visual Grounding**: High-resolution PNG captures of 2D/3D editor viewports and live running game frames.

---

## 📋 Requirements

- **Node.js**: `v22.0.0` or newer
- **Godot Engine**: `4.x` (Tested and verified against Godot 4.6.3-stable)
- **OS**: Windows 10/11 (Tier-1 validated); Linux and macOS supported via standard Node.js/Godot CLI

---

## 📄 License & Links

- **Repository**: [https://github.com/SrDarkoll/godot-mcp](https://github.com/SrDarkoll/godot-mcp)
- **Issues**: [https://github.com/SrDarkoll/godot-mcp/issues](https://github.com/SrDarkoll/godot-mcp/issues)
- **License**: MIT © [SrDarkoll](https://github.com/SrDarkoll)
