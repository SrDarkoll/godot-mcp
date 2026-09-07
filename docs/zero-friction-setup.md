# Zero-Friction Setup

This document describes the bootstrap foundation for Godot MCP 0.2.

## Target flow

After the CLI package is published to its final npm namespace, the intended setup is:

```powershell
npx @godot-mcp/cli init . --client antigravity
```

Optional focused profile:

```powershell
npx @godot-mcp/cli init . --client cursor --tool-profile 2d
```

`init` keeps its existing addon/config behavior and additionally:

1. resolves Godot from `--godot`, saved project config, `GODOT_BIN`, or a bounded local discovery pass;
2. installs/enables the managed addon;
3. persists the requested tool profile;
4. safely merges a `godot-mcp` entry into the requested MCP client config.

## Supported client targets

- `cursor`: project-local `.cursor/mcp.json`.
- `antigravity`: project-local `.agents/mcp_config.json` by default (Antigravity also supports the global `~/.gemini/config/mcp_config.json`).
- `claude`: the platform Claude Desktop config location.

Advanced/test overrides:

- `GODOT_MCP_CURSOR_CONFIG`
- `GODOT_MCP_ANTIGRAVITY_CONFIG`
- `GODOT_MCP_CLAUDE_CONFIG`

The writer preserves unrelated JSON keys and unrelated MCP servers. If it changes an existing config file, it first creates a timestamped `.bak` copy. Malformed JSON or a non-object `mcpServers` value is rejected rather than repaired silently.

## Bounded Godot discovery

Discovery is intentionally shallow.

On Windows it checks executable names on `PATH`, then versioned Godot executables directly inside:

- Desktop
- Downloads
- `%LOCALAPPDATA%\Programs\Godot`
- `%ProgramFiles%\Godot`

It does not recursively crawl the disk. Candidates are accepted only when `--version` succeeds and reports Godot 4.x.

macOS checks `PATH` plus the standard `Godot.app` locations. Linux checks `PATH`, `/usr/bin`, and `/usr/local/bin`.

## Publication boundary

This change makes the bootstrap flow testable from packed workspace tarballs, but it does **not** publish anything to npm. The final public npm namespace, credentials, provenance, and release action remain a separate explicit release step.
