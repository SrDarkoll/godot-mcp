# Client setup and first connection

Reviewed against the official client documentation on 2026-10-16. The runtime support boundary remains Windows with Godot 4.6.3; MCP support in a client does not prove a particular installed client version has connected successfully.

## Setup

Install the CLI once with `npm install -g @srdarkx/godot-mcp@latest`. For each game, create its Godot project first and open a terminal in the folder containing `project.godot`. Godot itself may be installed elsewhere.

Run one of `godot-mcp init --client cursor`, `godot-mcp init --client antigravity`, `godot-mcp init --client claude` or `godot-mcp init --client codex`. The path defaults to the current directory. A bare `godot-mcp init` does not choose a client interactively.

Use `--godot "C:\Tools\Godot.exe"` if executable detection fails. Reopen the Godot project after installation. The client launches the server, so a second terminal running `start` is unnecessary.

Without a global install, substitute `npx --yes @srdarkx/godot-mcp@latest` for `godot-mcp`. Launchers inside client configuration deliberately pin the installed package version, not `@latest`.

## Automatic setup clients

### Cursor

- Command: `godot-mcp init --client cursor`.
- File: the project's `.cursor/mcp.json`, with an entry under `mcpServers.godot-mcp`.
- The generated local entry declares `type: "stdio"`, `command` and `args`.
- Open this workspace, review/enable the server in Cursor's MCP settings and reload the connection if it was already running. Inspect its connection logs if startup fails.

Source: [Cursor MCP documentation](https://cursor.com/docs/mcp), including STDIO fields and project/global configuration locations.

### Google Antigravity

- Command: `godot-mcp init --client antigravity`.
- File: the workspace's `.agents/mcp_config.json`, under `mcpServers.godot-mcp`.
- Open that workspace. The IDE exposes MCP management through the agent panel's MCP Servers menu; the CLI exposes `/mcp`. Reload/enable the entry and inspect its connection status.
- If an older installation only exposes a global raw configuration, inspect the file opened by its own MCP manager instead of assuming it reads the current workspace format. An explicit `GODOT_MCP_ANTIGRAVITY_CONFIG` override can target that file.

Source: [Google Antigravity MCP documentation](https://antigravity.google/docs/mcp). Antigravity is not interchangeable with Gemini CLI.

### Claude Desktop

- Command: `godot-mcp init --client claude`.
- Windows file: `%APPDATA%\Claude\claude_desktop_config.json`, under `mcpServers.godot-mcp`.
- Fully quit and reopen Desktop. Inspect its Developer settings or the conversation's Connectors menu for the local server and its tools. Organization policy may disable local servers.
- This config is global, not tied to an active workspace. A second project's initialization replaces the managed project's absolute target, retaining a backup. It does not automatically follow the Godot window. For simultaneous projects, merge separately named entries manually and verify the path before mutations.

This is the local Desktop mechanism, not Claude Code or a remote connector URL. Sources: [Anthropic local MCP setup and connection status](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) and the [official MCP local-server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers), including the Windows JSON path and restart procedure.

### Codex

The existing [Codex guide](codex.md) covers project trust, restart and non-Git project-root detection. Its setup behavior is unchanged by this documentation pass.

## Manual clients

The CLI currently accepts only `codex`, `cursor`, `antigravity` and `claude` as automatic `--client` targets. Do not pass `gemini`, `cline` or `roo` to that flag.

First install the addon using `godot-mcp init`. Then merge this local STDIO entry into the client's actual configuration, replacing the project path and matching the version reported by `godot-mcp --version`:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": [
        "--yes",
        "@srdarkx/godot-mcp@0.6.5",
        "start",
        "C:/Games/My Game",
        "--tool-profile",
        "full"
      ]
    }
  }
}
```

Do not replace unrelated settings or other servers. These clients consume the same STDIO protocol, but their application-specific connection must still be verified. The local WebSocket bridge is not a remote HTTP MCP endpoint.

### Gemini CLI

Use the project's `.gemini/settings.json` and merge the entry into its top-level `mcpServers`. Trust the workspace when prompted; untrusted folders do not activate workspace MCP servers. Restart the session and inspect `/mcp` or `gemini mcp list`.

Sources: [Gemini CLI MCP configuration](https://geminicli.com/docs/tools/mcp-server/) and [trusted folders](https://geminicli.com/docs/cli/trusted-folders/). The Antigravity `.agents/mcp_config.json` file does not configure Gemini CLI.

### Cline

Open MCP Servers, then Configure and Configure MCP Servers in the extension. Merge the local entry into the settings JSON it opens. Enable/restart the server, check its tools and make a read-only test call. Cline CLI uses its own settings location; follow the client documentation rather than assuming the extension's path.

Source: [Cline MCP documentation](https://docs.cline.bot/mcp/mcp-overview).

### Roo Code

Use Edit Project MCP in its MCP settings to open the project's `.roo/mcp.json`, or Edit Global MCP for user configuration. Merge the local entry under `mcpServers`, enable it and inspect the tools. Project entries take precedence over same-named global entries.

Source: [Roo Code's published MCP documentation](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo/).

## Verify the actual project connection

1. Reopen the same Godot project and reload the client as described above.
2. Run `godot-mcp doctor` and `godot-mcp status` from its root. These distinguish installation checks from live server/editor state.
3. Ask the assistant to call `session.status` and `project.info` without mutations. Check the absolute project path and editor connectivity, not just the client's enabled toggle.
4. Run F6 after a playable scene exists, or F5 after selecting a main scene, and check runtime connectivity separately. A new, empty project does not need a running game to use editor tools.

Changing a client file does not automatically restart a previously running server. If the client cannot find `npx`, restart it after installing Node.js/npm and inspect its inherited PATH. If `godot-mcp` is not recognized in a terminal, fix the global CLI installation/PATH, not the Godot project's location.

## Updates and configuration preservation

Update the CLI with `npm install -g @srdarkx/godot-mcp@latest`, then preview and apply `godot-mcp upgrade --dry-run` and `godot-mcp upgrade` in each project. The upgrade flow handles recognized Codex launchers. JSON clients currently need their matching `init --client` command rerun after upgrade, before reconnecting, to refresh a version-pinned entry. Follow prompts about active sessions and keep the retained backups.

Automatic setup preserves unrelated JSON properties and other MCP server names and backs up an existing file before changing the managed entry. Invalid JSON is rejected rather than silently replaced. It can replace the managed `godot-mcp` entry, so inspect a manually customized entry and keep its backup.

## What was verified

- Official client documentation was compared with the config location, JSON shape and STDIO launch arguments.
- Regression tests cover Cursor, Antigravity and Claude Desktop configuration creation, unrelated-setting preservation, backups, idempotence and invalid-file handling. Tests redirect user paths into temporary fixtures, not personal profiles.
- Short-command parsing and the real compiled MCP STDIO transport are checked separately from native client applications.
- A passing configuration/transport test is **not** an end-to-end test of the installed Cursor, Antigravity, Claude Desktop, Gemini CLI, Cline or Roo Code UI. Those clients' authentication, permissions, discovery and Godot editor connection require the live checks above; no blanket native-client success claim is made here.
