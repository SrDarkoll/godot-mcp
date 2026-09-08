# @srdarkx/godot-mcp

[![npm version](https://img.shields.io/npm/v/@srdarkx/godot-mcp.svg)](https://www.npmjs.com/package/@srdarkx/godot-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Godot Engine](https://img.shields.io/badge/Godot-v4.x-478cbf?logo=godot-engine&logoColor=white)](https://godotengine.org)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-183%20Tools-8A2BE2)](https://github.com/SrDarkoll/godot-mcp)
[![Status](https://img.shields.io/badge/Status-Stable%20%7C%20Production--Ready-success)](https://github.com/SrDarkoll/godot-mcp)

The official CLI launcher and Model Context Protocol bridge for **Godot Engine 4.x**.

Connect modern AI assistants (**Cursor**, **Claude Desktop**, **Antigravity**, **Roo Code**, **Cline**, and custom agents) directly to your running Godot editor and game runtime.

---

## 🚀 Quickstart (Zero-Friction Bootstrap)

Initialize any Godot 4.x project in seconds with a single command:

```bash
npx @srdarkx/godot-mcp init path/to/your/godot-project
```

### What `init` does automatically:
1. **Discovers Godot**: Detects your installed Godot 4.x binary across standard Windows and system paths.
2. **Installs the Bridge Plugin**: Copies the hardened `addons/godot_mcp` EditorPlugin into your project.
3. **Enables the Plugin**: Activates the plugin automatically in headless mode without manual editor clicks.
4. **Configures Your AI Client**: Automatically creates or updates your client configuration (`.cursor/mcp.json`, Claude Desktop config, or Antigravity).

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

## 🎯 183 Tools Across 8 Profiles

Godot MCP exposes **183 canonical tools** partitioned into 8 profiles to optimize AI context window tokens:

| Profile | Tools | Focus | Key Capabilities |
| :--- | :---: | :--- | :--- |
| `minimal` | 3 | Liveness | Status check, engine capabilities, tool registry |
| `core` | 31 | Project & Scenes | Nodes, resources, scene tree, atomic transactions |
| `2d` | 46 | 2D Games | Core + Node2D, Sprite2D, TileMapLayer, TileSet, Camera2D, Collision2D |
| `3d` | 51 | 3D Worlds | Core + Node3D, Mesh3D, Camera3D, Lights, Materials, Shaders |
| `navigation` | 40 | Pathfinding | Core + 2D/3D NavigationRegion, NavigationMesh baking, NavigationAgent |
| `ui` | 44 | UI & Animation | Core + Control nodes, anchors, layouts, AnimationPlayer & AnimationMixer |
| `runtime` | 49 | QA & Debug | Core + Headless runner, live game inspection, interactive DAP debugger |
| `full` | 183 | Unrestricted | All available Godot MCP tools (default) |

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
