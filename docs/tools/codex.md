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
args = ["--yes", "@srdarkx/godot-mcp@0.6.3", "start", "C:/Games/MyGame", "--tool-profile", "2d"]
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

## Multiple Codex connections to one project

npm 0.6.2 starts an exclusive project server for each stdio connection. Codex can open a connection for tool discovery and another for a chat; the second launcher can exit with `Project is held by server`, which Codex reports as a failed initialization handshake. A project entry with `required = true` then prevents the chat from starting. `enabled` in `codex mcp list` only describes configuration, not a successful connection.

Starting with 0.6.3, one project server is reused through an authenticated local pipe. Each client retains its own MCP connection, tool profile and approval state; the editor, runtime, project policy and transaction service belong to the shared session. Closing one chat leaves other clients connected. Closing the last client finishes the session and removes its descriptor. Addon maintenance remains exclusive, and requests are never replayed after a disconnected session.

Upgrade the project and reconnect its clients to load this change. An already-running older server must be stopped once; it cannot gain the shared transport without restarting. The upgrade flow previews and confirms that shutdown. Keep a single project-local entry so the assistant sees one copy of the project's tools. The `godot-mcp` name can override a different global project binding, as explained above.

## Godot projects without Git and commands from subfolders

Codex normally finds the project root through `.git`. In a Godot project without Git, running `codex mcp get` from `.codex` or another subfolder can load a global launcher instead of the project-local entry. Trusting the parent directory does not supply a root marker. See [official project root detection](https://learn.chatgpt.com/docs/config-file/config-advanced#project-root-detection).

Starting with 0.6.3, this repair command is available:

```powershell
npx --yes @srdarkx/godot-mcp@latest setup codex . --register-project-root
```

It adds `project.godot` to `project_root_markers` in the active Codex user config, preserves existing markers, all MCP entries, model settings and comments, and keeps an exact backup before a change. It does not mark a project as trusted or retarget a global server. Plain `setup codex` remains a read-only recipe. Reconnect Codex after registration.

`doctor` also asks the installed Codex CLI which entries it selects from the requested directory. A mismatched target, disabled canonical entry, wrong tool profile, unreadable client config or duplicate enabled aliases fails that readiness check. If Codex CLI is unavailable, the result explicitly says selection was not verified. Installation verification inside `upgrade` remains separate from client activation and trust.
