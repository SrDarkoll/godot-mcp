# Upgrading an existing Godot MCP project

The safe upgrade flow is available starting with 0.6.1. It is not part of npm 0.6.0.

Run from the Godot project:

```powershell
npx --yes @srdarkx/godot-mcp@latest upgrade .
```

The updater inspects the installation and the project-local `.codex/config.toml` first. It recognizes older `npx` launches of `@srdarkx/godot-mcp` and Node recipes that point to the server inside that public package. It preserves other MCP entries, model settings, environment tables and extra options, and pins the migrated launcher to the installed version.

If a project session is active, it asks before stopping it through authenticated management. That shutdown can also stop a game owned by the session. It does not kill an arbitrary process or adopt a changed session identity.

The updater then holds the project maintenance lease, prepares Godot settings without saving the original, backs up changed files, installs the addon and configuration, and runs `doctor`. On verification failure it restores the earlier bytes. Backups are retained under `.godot-mcp/upgrade-backups/`; an interrupted update keeps a recovery marker so another server cannot start against a partial installation. Run `upgrade` again to recover and retry. Conflicting human edits are preserved and reported instead of being overwritten.

## Update notices

Starting with 0.6.3, a passive update checker is included. Versions 0.6.2 and earlier need one initial upgrade before they can notify you about later releases.

Valid CLI commands check the public npm `latest` dist-tag and print an available update to stderr, separately from normal output and `--json`. A cached reminder appears at most once per installed/latest version pair per day. During MCP use the check runs in the background, and the next completed tool response after a newer version is known includes one notice per new version in that session. Structured results, error flags and approval requests retain their existing format. The assistant can share the notice with you; the client decides how tool content is displayed.

The notice gives the installed and latest versions, the project folder, the `upgrade` command above, and instructions for global or local npm installations. `npx ...@latest` already selects the current package. Updating only a global npm installation does not migrate a project addon or a version-pinned client launcher: run `upgrade` for each Godot project, then reload the addon and reconnect the client. Recognized project-local Codex launchers are migrated; other clients and global/custom entries may still need their launcher version updated.

Registry requests have a one-second deadline and an 8 KiB response limit. Successful checks are cached for 24 hours; failed checks are retried after one hour. Network and cache failures do not change command exit codes. Only public version metadata is fetched, with no npm token or project content. The checker never installs a package, edits a project, or stops a session.

Cache location: `%LOCALAPPDATA%\godot-mcp\update-check.json` on Windows, `$XDG_CACHE_HOME/godot-mcp/update-check.json` on other systems, or `~/.cache/godot-mcp/update-check.json` when that base directory is unavailable. The file contains package versions and check/reminder timestamps.

To disable checking in PowerShell:

```powershell
$env:GODOT_MCP_UPDATE_CHECK = '0'
```

For an MCP process, set `GODOT_MCP_UPDATE_CHECK=0` in its client environment configuration and reconnect. Checks are also disabled in CI, Vitest, npm offline mode, or when `NO_UPDATE_NOTIFIER` is enabled.

## Windows and multiple projects

Starting with 0.6.3, CRLF Codex launch fields are handled, including multiline arrays and disabled aliases. Linked CLI/server entry paths are resolved before starting, every bundled addon file is verified with SHA-256, and all project configuration fields are validated with the same schema used by the server.

The launcher also shares a project session across multiple MCP clients, including Codex tool discovery and chats. Only one process owns the editor bridge and maintenance lease; clients authenticate to that process and retain separate MCP approval state. An older active server still needs one controlled restart to load this transport. See the [Codex connection guide](tools/codex.md#multiple-codex-connections-to-one-project).

New installations select a free loopback port by default (`bridgePort: 0`). Existing explicit port settings are preserved. To move an older fixed-port project to automatic selection, preview and apply it explicitly:

```powershell
npx --yes @srdarkx/godot-mcp@latest upgrade . --bridge-port 0 --dry-run
npx --yes @srdarkx/godot-mcp@latest upgrade . --bridge-port 0
```

This setting is included in the upgrade backup and rollback. Dead descriptor owners are treated as offline without connecting to their old port; a reused port can belong to another project. Live or unverifiable owners still require authenticated management, and confirmation identity checks remain in place.

For a non-Git Godot project that Codex ignores from a subfolder, use the [project root registration command](tools/codex.md#godot-projects-without-git-and-commands-from-subfolders). It changes only the user root marker setting with a backup; the ordinary upgrade does not edit the Codex user profile.

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
