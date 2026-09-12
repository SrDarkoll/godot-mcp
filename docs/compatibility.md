# Compatibility

| Component | Current evidence / support boundary |
|---|---|
| Windows | Supported project-lease/server/CLI maintenance platform; tested locally. |
| Node 22 | Local development and integration validation target. |
| Node 24 | Local Node 24.20.0 matrix passed unit/type/catalog/base integration/distribution gates; also configured in Windows CI. |
| Godot 4.6.3 stable, standard Windows build | Pinned engine used for native syntax, editor, runtime and capture tests. |
| Other Godot 4.x | Not covered by the same validation claim; feature flags and native API availability may differ. |
| Linux/macOS | Server/maintenance currently fail with UNSUPPORTED_PLATFORM; not advertised as supported. |
| Headless renderer | Syntax, transport, mutation/recovery and CLI checks; not a substitute for graphical capture tests. |
| Graphical Windows session | Required for visual/runtime graphical suites; graphics driver and viewport availability still matter. |

Protocol version 1 is shared across packages. Update the server, protocol, CLI and addon together. Capability flags describe what the connected addon offers; tools can return CAPABILITY_UNAVAILABLE when a required capability is absent. Runtime readiness, ownership and individual runtime feature flags impose additional checks.

Native Logger diagnostics require a compatible Godot build. Missing diagnostics must not be reported as a complete error-free run. No compatibility claim is inferred merely because Godot's major version is 4 or Node meets an engines field.
