# Codex client setup

Godot MCP includes Codex as an `init --client codex` target. The project-local configuration works with Codex CLI, the IDE extension, and local Codex tasks in the desktop app on the same host. Codex loads `.codex/config.toml` only after you trust the project; see the [official MCP guide](https://learn.chatgpt.com/docs/extend/mcp) and [configuration precedence](https://learn.chatgpt.com/docs/config-file/config-basic).

From npm version 0.5.1 or newer:

```powershell
npx @srdarkx/godot-mcp init "C:\Games\MyGame" --client codex --tool-profile 2d
```

This creates or updates `C:\Games\MyGame\.codex\config.toml` with a project-scoped stdio server:

```toml
[mcp_servers.godot-mcp]
command = "npx"
args = ["--yes", "@srdarkx/godot-mcp@0.6.1", "start", "C:/Games/MyGame", "--tool-profile", "2d"]
```

The generated file uses an absolute project path so the server opens the intended Godot project regardless of Codex's process directory. Starting with 0.6.1, generated launchers pin the installed version, and `init` offers the safe upgrade flow for an existing installation. The [upgrade guide](../upgrading.md) covers confirmed shutdown, migration of recognized older npm/bundled-server entries, retained backups and verification. Other MCP entries and custom server options are preserved. Unrelated commands remain protected. The updater changes only the project's Codex configuration, not `~/.codex/config.toml`.

Restart Codex after setup. Use `codex mcp list` in the project or `/mcp` in a local Codex session to check the server. `godot-mcp doctor "C:\Games\MyGame"` checks the managed entry against that project's current tool profile; it does not require Codex configuration in projects using another client.

For source development, run `npm run build` and then `node packages/cli/dist/index.js setup codex "C:\Games\MyGame"`. That read-only command prints a local Node launcher and TOML recipe for the compiled server. Use this recipe when testing source changes that have not yet been published to npm.
