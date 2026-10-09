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

## Custom launchers and upgrade preview

These improvements are available starting with 0.6.2. They are not included in npm 0.6.1.

The updater also recognizes the verified Godot MCP source workspace and a local Node script followed by a verified server entry, such as `node retry.mjs packages/server/dist/index.js --project PROJECT`. It inspects ordinary files and package manifests without executing the script. Unrelated servers, ambiguous arguments, links and other project targets remain protected.

These installations have different behavior from the npm launcher. The preview explains the change before asking: replacing a source launcher stops following local code changes, and replacing a script stops running its custom behavior in Codex. The script itself is kept. The old configuration is backed up exactly; model settings, other MCP entries, environment tables and options such as `required` and `startup_timeout_sec` are preserved.

Run from your Godot project to inspect the upgrade:

```powershell
npx --yes @srdarkx/godot-mcp@latest upgrade . --dry-run
npx --yes @srdarkx/godot-mcp@latest upgrade . --dry-run --json
```

The preview shows the version transition, configuration path, proposed launcher, active session impact and backup directory. It does not start Godot, acquire a maintenance lease, create backups, write project files or stop a session. It works even when Godot discovery is unavailable. The preview is not a successful installation or doctor verdict.

Interactive `upgrade` and the existing-installation flow in `init` ask once for the launcher and session changes shown in the preview. Declining preserves both. JSON or non-interactive mode supplies the next command and project directory instead of asking for manual TOML edits:

```powershell
# Approve replacing a custom/source launcher; keep its script file
npx --yes @srdarkx/godot-mcp@latest upgrade . --replace-launcher

# Also approve stopping this project's active session
npx --yes @srdarkx/godot-mcp@latest upgrade . --replace-launcher --yes --json
```

`--yes` alone never approves removing custom launcher behavior. `--replace-launcher` alone never approves stopping an active session. Even with both flags, `--dry-run` remains read-only. If the Codex configuration changes during confirmation, the updater cancels before stopping the session and keeps that edit. Verification failure restores the custom configuration along with the addon and settings. If a failure occurs after an approved shutdown, the error states that the session remains stopped and must be reconnected.
