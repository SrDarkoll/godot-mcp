# Codex client setup

Godot MCP includes Codex as an `init --client codex` target. The project-local configuration works with Codex CLI, the IDE extension, and local Codex tasks in the desktop app on the same host. Codex loads `.codex/config.toml` only after you trust the project; see the [official MCP guide](https://learn.chatgpt.com/docs/extend/mcp) and [configuration precedence](https://learn.chatgpt.com/docs/config-file/config-basic).

From npm version 0.5.1 or newer:

```powershell
npx --yes @srdarkx/godot-mcp@latest init "C:\Games\MyGame" --client codex --tool-profile 2d
```

This creates or updates `C:\Games\MyGame\.codex\config.toml` with a project-scoped stdio server:

```toml
[mcp_servers.godot-mcp]
command = "npx"
args = ["--yes", "@srdarkx/godot-mcp@0.6.2", "start", "C:/Games/MyGame", "--tool-profile", "2d"]
```

The generated file uses an absolute project path so the server opens the intended Godot project regardless of Codex's process directory. Starting with 0.6.1, generated launchers pin the installed version, and `init` offers the safe upgrade flow for an existing installation. The [upgrade guide](../upgrading.md) covers confirmed shutdown, migration of recognized older npm/bundled-server entries, retained backups and verification. Other MCP entries and custom server options are preserved. Unrelated commands remain protected. The updater changes only the project's Codex configuration, not `~/.codex/config.toml`.

Restart Codex after setup. Use `codex mcp list` in the project or `/mcp` in a local Codex session to check the server. `godot-mcp doctor "C:\Games\MyGame"` checks the managed entry against that project's current tool profile; it does not require Codex configuration in projects using another client.

For source development, run `npm run build` and then `node packages/cli/dist/index.js setup codex "C:\Games\MyGame"`. That read-only command prints a local Node launcher and TOML recipe for the compiled server. Use this recipe when testing source changes that have not yet been published to npm.

## Unexpected CLI version or `Invalid MCP client`

Use `@latest` for the setup and diagnostic commands. Without a version specifier, [npm can reuse a locally installed package](https://docs.npmjs.com/cli/v11/commands/npm-exec/), including one resolved from a parent directory. An older CLI can reject `codex` even when the project's addon was installed with a newer version.

```powershell
npx --yes @srdarkx/godot-mcp@latest --version
npx --yes @srdarkx/godot-mcp@latest doctor .
```

Generated client launchers pin the installed version so reconnecting does not implicitly upgrade the server. The explicit `@latest` bootstrap command and the version-pinned launcher serve different purposes.

## Codex opens a different Godot project

Run `codex mcp get godot-mcp --json` from the intended project directory and check the path after `start`. A copied `.codex/config.toml` also copies its absolute Godot project path; folder trust does not correct that path. Run `doctor` with the explicit package version to verify the managed entry, then restart the MCP connection in the affected Codex project after correcting its configuration.

A global entry can intentionally target another project while the trusted project-local entry overrides it. If a separate global alias also starts the same Godot project, enable one entry within that project to avoid duplicate server starts and `PROJECT_BUSY`.

`INFO bridge` and `INFO runtimeConnection` describe live connection state. An offline MCP server or disconnected runtime agent does not by itself make addon installation fail.
