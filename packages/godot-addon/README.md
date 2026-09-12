# @godot-mcp/godot-addon

Native EditorPlugin, debugger/runtime agent and serialization helpers for Godot MCP. Godot 4.6.3 on Windows is the current local validation target.

Use the matching @godot-mcp/cli package to initialize or update a project. The CLI installs addons/godot_mcp, enables the plugin, sets up the runtime autoload and generates the compatible diagnostic adapter. Manual copying alone does not perform those setup steps.

The addon discovers an authenticated project-local MCP bridge and uses engine APIs for editing and viewport capture. It does not simulate mouse/keyboard input. Runtime ownership distinguishes an MCP-started game from a manually started one.

Stop the MCP server before updates. Keep update journals, snapshots and screenshots until deliberately reviewed. Native serialization is bounded; oversized values return errors rather than recursively expanding without limits. Project scripts remain trusted code and are not OS-sandboxed by tool permissions.
