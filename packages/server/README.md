# @godot-mcp/server

Standard MCP stdio server for a project-local Godot addon. Windows, Node 22 and Godot 4.6.3 are the current local validation target. Install all four Godot MCP packages at matching versions.

```powershell
godot-mcp-server --project C:\Games\Example
```

Initialize the project with @godot-mcp/cli first. The server creates an authenticated localhost bridge descriptor and retained session artifacts. A process-owned project lease prevents a second cooperating server from replacing its descriptor. Stdout is reserved for MCP; diagnostics go to stderr.

Tool metadata exposes baseline permissions, risk and required capabilities; exact arguments may require additional permissions or confirmation. Custom project scripts are not OS-sandboxed. File transactions use optimistic preconditions and retained recovery journals, not atomically visible multi-file replacement for arbitrary external writers. Do not delete recovery evidence to bypass errors.

This is an unpublished pre-alpha package; no stable-support or remote-CI claim is implied by its version.
