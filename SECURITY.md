# Security model and reporting

Godot MCP is an automation bridge for projects and scripts trusted by their operator. It is not an operating-system sandbox. Project scripts, tool scripts, resource loaders, getters and custom methods can execute Godot code. Session permission flags classify MCP operations; they do not restrict the OS privileges of Godot or Node.

The WebSocket bridge binds to 127.0.0.1, authenticates a session token and checks project identity. Anyone who obtains `.godot-mcp/runtime/bridge.json` may obtain that session's local authority. Keep descriptors and local config out of source control and shared archives. Review logs, snapshots and screenshots before sharing; backups intentionally contain exact source bytes.

Reflective calls use a native class/method allowlist and scene/project target checks. Indirect dispatch stays prohibited. Custom script methods require the session permission `editor.script_methods`, `trusted_script: true` and confirmation. Confirmations are single-use and tied to exact arguments and relevant fingerprints; they are not a separate human-authentication system.

The Windows project lease prevents concurrent cooperating MCP servers and addon updates. It does not prevent arbitrary external processes from writing the project. File publication uses optimistic preconditions, journals and compensation; do not claim fully serializable or atomically visible multi-file transactions. Preserve unresolved journals and snapshots rather than deleting them to suppress errors.

Report security concerns with the affected version, a minimal non-sensitive reproduction, impact and expected behavior. Do not include live tokens or private game files in a public issue. Use the repository's private vulnerability reporting channel if enabled; otherwise obtain a private contact from the maintainer before sending sensitive details. No private reporting address or response SLA is currently declared.

There is no security-support/LTS branch with a declared response SLA. See CHANGELOG.md and the versioned release notes for implementation status. A clean dependency scan is not proof that project code or reflective automation is safe.
