# @godot-mcp/cli

Windows-first pre-alpha CLI for Godot MCP. Install the protocol, server, CLI and addon tarballs from the same release together; these packages are not currently published to the npm registry.

```powershell
godot-mcp init C:\Games\Example --godot C:\Tools\Godot_v4.6.3-stable_win64.exe
godot-mcp doctor C:\Games\Example --json
godot-mcp setup codex C:\Games\Example
godot-mcp start C:\Games\Example
```

Start is MCP stdio: stdout must remain protocol-only. Configure the client to launch that command, then open the project in Godot. Setup prints a recipe without changing client configuration.

Use status/stop/permissions with --json. Stop the MCP server before addon update. A project lease excludes cooperating servers/updaters. Interrupted updates retain a journal and backups; rerun addon update to resume compensation. External conflicts are not overwritten. Config damage can be repaired with config --repair; original bytes are backed up.

Godot 4.6.3 and Node 22 on Windows are the local validation target. Project scripts are trusted code, not sandboxed. Keep runtime bridge tokens, private logs, screenshots and backups out of shared archives. Run --help for command syntax.
