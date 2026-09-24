# Project maintenance and `PROJECT_BUSY`

Godot MCP permits one cooperating server or addon maintenance operation per project. A Windows named pipe owns the lease for the process lifetime; a crashed process releases it automatically. The lease reports its current operation (`server`, `project_init`, `addon_install` or `addon_update`), PID, acquisition time and elapsed hold time when the owner supports this protocol.

`init` and addon installation/update wait up to 1.5 seconds for a short maintenance lease. An active `server` fails immediately because waiting cannot safely update its loaded addon. The CLI queries authenticated server status when available and reports whether its editor is connected. A legacy owner may not provide metadata; the error says the owner is unknown instead of guessing. Pipe access denial has a separate `PROJECT_ACCESS_DENIED` code.

When `PROJECT_BUSY` names a running server, use `godot-mcp status <project>` to inspect it and `godot-mcp stop <project>` when you intend to update the addon. A busy error does not prove that Godot itself is stuck; the editor can remain connected while MCP maintenance is correctly excluded. Review the operation and session before retrying.
