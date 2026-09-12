# @godot-mcp/protocol

Shared TypeScript/Zod schemas for protocol version 1 of Godot MCP: bridge identity, runtime messages, diagnostics, captures, session artifacts, permissions and recovery records.

Install with matching versions of @godot-mcp/server, @godot-mcp/cli and @godot-mcp/godot-addon. These schemas validate message shape; they do not grant authority or sandbox project code. Session tokens and bridge descriptors are confidential local credentials.

This package is currently distributed as a pre-alpha tarball with the other workspaces, not as a published registry release.
