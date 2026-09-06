# Godot MCP Compatibility & Capability Core Design

## Goal

Add a horizontal compatibility layer that lets Godot MCP reason about effective Godot 4.x capabilities and known engine semantics without scattering version/property checks across domain handlers.

## Scope

Phase 5 adds:

- structured engine version metadata;
- reusable feature probes for classes, methods, properties, editor methods, and headless state;
- a capability registry with `supported`, `restricted`, and `unsupported` states;
- a quirk registry for known engine-version semantics;
- a bounded capability manifest sent in the authenticated addon handshake;
- one read-only MCP introspection tool: `godot.capabilities`;
- migration of NavigationAgent3D persistence semantics to the compatibility core;
- migration of editor viewport capture availability to the same core.

Phase 5 does **not**:

- add Physics/Audio/Particles verticals;
- expose raw `ClassDB` browsing or arbitrary feature queries;
- create tools such as `godot.classes`, `godot.methods`, or `godot.properties`;
- rewrite every existing handler;
- guarantee support for an untested Godot minor version.

## Architecture

`compatibility_core.gd` is created once by `rpc_dispatcher.gd` and shared with capability-aware handlers. It owns immutable engine metadata, a `FeatureProbe`, and a `QuirkRegistry`.

```text
Engine.get_version_info + ClassDB + EditorInterface + DisplayServer
                              |
                         FeatureProbe
                              |
                         QuirkRegistry
                              |
                     CompatibilityCore
                              |
                   CapabilityManifest
                      /              \
             NavigationHandler    VisualHandler
                              |
                           hello
                              |
                         BridgeServer
                              |
                    godot.capabilities
```

The feature probe is the primary source of truth. Version rules refine behavior only where runtime introspection cannot express semantics.

## Engine version

The core reports the current engine as:

```json
{
  "major": 4,
  "minor": 6,
  "patch": 3,
  "status": "stable",
  "build": "official",
  "hash": "...",
  "string": "4.6.3.stable.official..."
}
```

Missing engine dictionary fields are serialized as empty strings. Major/minor/patch are integers.

## FeatureProbe

The probe provides bounded internal helpers:

- `class_exists(class_name)` using `ClassDB.class_exists`;
- `class_has_method(class_name, method_name)` using `ClassDB.class_has_method`;
- `class_has_property(class_name, property_name)` by scanning `ClassDB.class_get_property_list`;
- `editor_has_method(method_name)` against the current `EditorInterface`;
- `is_headless()` using `DisplayServer.get_name()`.

No RPC accepts arbitrary class/method/property names from the MCP client.

## Capability manifest

The addon handshake gains optional `compatibility` metadata for protocol compatibility with older addon fixtures. The current addon always sends it.

The manifest is bounded to known capability IDs and has schema version `1`:

```json
{
  "schemaVersion": 1,
  "engine": { "major": 4, "minor": 6, "patch": 3, "status": "stable", "build": "official", "hash": "...", "string": "..." },
  "capabilities": {
    "navigation.region.2d": { "status": "supported" },
    "navigation.region.3d": { "status": "supported" },
    "navigation.mesh.bake.2d": { "status": "supported" },
    "navigation.mesh.bake.3d": { "status": "supported" },
    "navigation.agent.2d": { "status": "supported" },
    "navigation.agent.3d": { "status": "supported" },
    "navigation.agent3d.keep_y_velocity": {
      "status": "restricted",
      "reason": "Only authorable while use_3d_avoidance is false"
    },
    "visual.viewport2d.capture": { "status": "supported" },
    "visual.viewport3d.capture": { "status": "supported" }
  },
  "quirks": {
    "navigation.agent3d.keep_y_velocity.hidden_with_3d_avoidance": {
      "active": true,
      "reason": "Known Godot 4.6+ persistence/property-usage behavior"
    }
  }
}
```

Capability entries contain only `status` and optional `reason`. Quirk entries contain `active` and optional `reason`. This avoids turning the manifest into a reflection dump.

## Capability computation

### Navigation

- region 2D requires `NavigationRegion2D`;
- region 3D requires `NavigationRegion3D`;
- bake 2D requires `NavigationPolygon`, `NavigationServer2D.parse_source_geometry_data`, and `NavigationServer2D.bake_from_source_geometry_data`;
- bake 3D requires `NavigationMesh`, `NavigationServer3D.parse_source_geometry_data`, and `NavigationServer3D.bake_from_source_geometry_data`;
- agents require their respective classes;
- `navigation.agent3d.keep_y_velocity` is unsupported if the property does not exist;
- if it exists, it is `restricted` because it is authorable only in 2D avoidance mode.

For Godot 4.6+ the known property-usage/persistence quirk is marked active. For earlier or future unknown minors the restriction remains conservative because the property has no useful semantics under 3D avoidance; the quirk flag only records the specifically known persistence behavior.

### Visual

A viewport capture capability is supported only when:

- the process is not headless; and
- the current `EditorInterface` exposes the corresponding viewport getter.

Otherwise it is unsupported with a concise reason.

## Handler integration

### NavigationAgent3D

`navigation_handlers.gd` no longer owns version knowledge. It asks the core whether `navigation.agent3d.keep_y_velocity` is available/restricted and whether the known quirk is active.

Behavior remains:

- with `use_3d_avoidance=false`, `keep_y_velocity` may be configured and inspected;
- with `use_3d_avoidance=true`, inspection omits it;
- configuring it while effective 3D avoidance is enabled returns `INVALID_ARGUMENT`;
- transitioning to 3D avoidance normalizes the hidden value to Godot's default `true`.

If the property is absent on a future/older engine, a request to configure it returns `UNSUPPORTED_CAPABILITY` instead of attempting a missing property.

### Visual

`visual_handlers.gd` asks the core for `visual.viewport2d.capture` / `visual.viewport3d.capture`. It retains per-capture validity checks after capability admission because viewport availability can change during a session.

## Public introspection

`godot.capabilities` is a read-only local MCP tool. It returns the authenticated addon manifest already held by `BridgeServer`; it does not perform arbitrary reflection and does not issue a new editor RPC.

If an older addon connects without a manifest, the tool returns `CAPABILITY_MANIFEST_UNAVAILABLE` rather than guessing.

## Security

- No user-controlled reflection probes.
- No raw `ClassDB` or RID exposure.
- Capability IDs are hard-coded internal identifiers.
- Manifest size remains bounded by a fixed set of entries.
- `godot.capabilities` is classified as a read-only tool.

## Compatibility strategy

Feature probing takes precedence over version assumptions. Version-specific quirks are narrow and conservative. Unknown future Godot 4.x versions use the same feature probes; absence means unsupported, not guessed support.

Phase 5 does not claim a multi-version support matrix. Windows Godot 4.6.3 remains the authoritative gate for this phase.

## Tests

Unit/contract coverage must verify:

- manifest schema accepts supported/restricted/unsupported entries and engine metadata;
- current hello may carry the manifest while old hello fixtures remain valid;
- BridgeServer exposes and clears authenticated compatibility metadata;
- `godot.capabilities` is read-only and returns no data before a manifest is authenticated;
- core source contains class/method/property/headless probes;
- Navigation uses the core rather than `Engine.get_version_info`/local compatibility branching;
- Visual uses the core for admission;
- the live integration handshake returns a 4.6.3 manifest with Navigation and Visual capabilities;
- existing Navigation E2E behavior remains green.

## Acceptance criteria

1. One compatibility core instance is shared by migrated handlers.
2. Effective capabilities are feature-first.
3. Known engine semantic quirks are centralized.
4. Navigation no longer contains Godot-version compatibility logic.
5. Visual no longer duplicates headless/editor-method admission logic.
6. `godot.capabilities` is the only new public tool.
7. Existing tools preserve their behavior on Godot 4.6.3.
8. Unknown/missing probed features fail conservatively.
9. All existing build, typecheck, unit, Godot syntax, standard, runtime, and visual gates remain green on the authoritative Windows environment.
