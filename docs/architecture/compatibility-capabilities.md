# Compatibility and capability core

Godot MCP treats engine compatibility as a horizontal concern instead of embedding version checks in each tool handler.

## Effective capabilities

The addon builds one bounded compatibility manifest when the editor bridge is created. Effective support is computed feature-first from:

- `Engine.get_version_info()` for structured engine metadata;
- `ClassDB.class_exists()` for required engine classes;
- `ClassDB.class_has_method()` for required engine methods;
- `ClassDB.class_get_property_list()` for required properties;
- `EditorInterface.has_method()` for editor-only APIs;
- `DisplayServer.get_name()` for graphical/headless availability.

Version rules are reserved for semantics that cannot be inferred from API presence alone.

Capability states are:

- `supported`: the required API/environment is available;
- `restricted`: the API exists but has an authoring restriction;
- `unsupported`: a required class, method, property, or environment feature is unavailable.

Unknown or absent features fail conservatively. The server does not infer support merely from a future version number.

## Known quirks

Quirks are centralized in `bridge/compatibility/quirk_registry.gd`. The initial known quirk records Godot 4.6+ `NavigationAgent3D.keep_y_velocity` property-usage behavior while `use_3d_avoidance` is enabled.

The quirk registry is intentionally narrow. It is not a replacement for `ClassDB`, and handlers should prefer direct feature capability checks whenever possible.

## Shared core

`rpc_dispatcher.gd` creates one `CompatibilityCore` per editor bridge. The manifest sent in the authenticated hello, Navigation authoring, and Visual viewport admission all use that same instance.

This prevents independent checks from disagreeing about the current editor.

## Public surface

Phase 5 adds one read-only tool:

```text
godot.capabilities
```

It returns the already-authenticated manifest retained by the bridge server. It does not accept arbitrary class, method, or property names and performs no new reflection request.

An older addon may still authenticate because the protocol field is optional. If it does not provide a compatibility manifest, `godot.capabilities` returns `CAPABILITY_UNAVAILABLE` rather than inventing one.

## Scope and support claims

This core is designed to make support for multiple Godot 4.x minors maintainable, but it does not itself prove a multi-version support matrix. Each claimed engine version still requires its own integration evidence. The authoritative Phase 5 gate remains Windows Godot 4.6.3.
