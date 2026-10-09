# Upgrading an existing Godot MCP project

The safe upgrade flow is available starting with 0.6.1. It is not part of npm 0.6.0.

Run from the Godot project:

```powershell
npx --yes @srdarkx/godot-mcp@latest upgrade .
```

The updater inspects the installation and the project-local `.codex/config.toml` first. It recognizes older `npx` launches of `@srdarkx/godot-mcp` and Node recipes that point to the server inside that public package. It preserves other MCP entries, model settings, environment tables and extra options, and pins the migrated launcher to the installed version.

If a project session is active, it asks before stopping it through authenticated management. That shutdown can also stop a game owned by the session. It does not kill an arbitrary process or adopt a changed session identity.

The updater then holds the project maintenance lease, prepares Godot settings without saving the original, backs up changed files, installs the addon and configuration, and runs `doctor`. On verification failure it restores the earlier bytes. Backups are retained under `.godot-mcp/upgrade-backups/`; an interrupted update keeps a recovery marker so another server cannot start against a partial installation. Run `upgrade` again to recover and retry. Conflicting human edits are preserved and reported instead of being overwritten.

## Options

```powershell
# Explicit consent for automation: may stop this project's active MCP session
npx --yes @srdarkx/godot-mcp@latest upgrade . --yes --json

# Create project-local Codex configuration when it does not already exist
npx --yes @srdarkx/godot-mcp@latest upgrade . --client codex

# Supply Godot when automatic discovery cannot find it
npx --yes @srdarkx/godot-mcp@latest upgrade . --godot "C:\Tools\Godot.exe"
```

The first `--yes` above belongs to `npx` and permits downloading the npm package. The `--yes` after `upgrade` belongs to Godot MCP and explicitly permits stopping its active project session. JSON/non-interactive mode never implies that consent.

For an existing project-local Codex installation, `init` offers this upgrade flow. In non-interactive mode, it reports `UPGRADE_AVAILABLE` with the command to use. An unrelated or ambiguous `godot-mcp` server remains protected, and invalid configurations are rejected before installation changes.

This implementation supports project maintenance on Windows and migrates project-local Codex configuration. It does not rewrite the user's global Codex profile. Other clients' configuration remains outside this migration flow.

After success, rescan or reopen an already-open Godot project so it loads the updated addon, then reconnect the MCP client. `doctor` verifies installation health; it does not certify the game's logic or visual design.
