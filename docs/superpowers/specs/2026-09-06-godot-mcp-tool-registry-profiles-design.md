# Godot MCP Tool Registry, Profiles & Discovery Design

## Goal

Add a centralized, deterministic tool catalog and startup profiles so Godot MCP can scale beyond its current 164-tool surface without replacing specialized tools with generic reflection or dynamically mutating MCP tool availability mid-session.

## Scope

Phase 6 adds:

- one canonical server-side catalog containing every public MCP tool name, domain, and profile membership;
- deterministic tool-profile selection at server startup;
- profile-aware registration that filters the MCP `tools/list` surface while still evaluating all registration declarations for catalog consistency;
- project configuration and CLI support for selecting a profile;
- one bounded read-only discovery tool: `godot.tools`;
- contract tests that fail when a registered tool is missing from the catalog or a catalog entry is never declared by the server;
- documentation of profile semantics and migration rules.

Phase 6 does **not**:

- delete or merge specialized tools;
- introduce generic `call_method`, arbitrary reflection, or a mega-tool;
- dynamically switch profiles after MCP server creation;
- infer a profile from the current scene;
- implement contract/code generation; that remains a later horizontal phase;
- add Physics, Audio, Particles, Environment, or another vertical domain.

## Architectural principles

1. **Full compatibility by default.** Existing installations continue to expose the full surface unless the user explicitly selects another profile.
2. **One source of tool membership truth.** Profile membership lives in one server catalog, not scattered through individual registrar files.
3. **Registration remains specialized.** Existing domain registration functions continue owning Zod schemas, descriptions, and handlers.
4. **Fail closed on catalog drift.** Attempting to register an uncataloged public tool throws during server construction.
5. **Deterministic sessions.** The active profile is resolved before MCP server creation and never changes for that server instance.
6. **Discovery is bounded.** `godot.tools` paginates and filters metadata instead of returning all tool schemas.
7. **No runtime capability confusion.** Tool profiles answer “which MCP tools are exposed”; Phase 5 capabilities continue answering “what this connected Godot build can actually do.”

## Architecture

```text
.godot-mcp/config.json / --tool-profile
                 |
                 v
         resolve ToolProfile
                 |
                 v
         ToolCatalog (static)
      name / domain / profiles
                 |
                 v
       ProfiledToolRegistrar
          /             \
         /               \
observe every       register active
 declaration        tools into MCP
         \               /
          \             /
             ToolRegistry
                 |
                 v
             godot.tools
```

The current registration functions remain unchanged where possible:

```text
registerNavigationTools(registrar, rpc)
registerPower2dTools(registrar, rpc)
...
```

They receive a `ToolRegistrar` whose `registerTool()` method:

1. looks up the tool name in the canonical catalog;
2. records the runtime description supplied by the existing registration declaration;
3. throws if the name is not cataloged;
4. registers the tool with the MCP server only when the active profile includes it.

This preserves one implementation of every handler while making exposure deterministic.

## Public profile IDs

The bounded profile set is:

```text
minimal
core
2d
3d
navigation
ui
runtime
full
```

`full` is the default in protocol/configuration and preserves the Phase 5 surface plus the new discovery tool.

### `minimal`

Purpose: low-token read-only orientation.

Always exposes only the compact foundation:

- `session.status`
- `godot.capabilities`
- `godot.tools`
- `project.info`
- `scene.get_tree`

It intentionally does not expose mutations, runtime control, raw object reflection, or recovery commands.

### `core`

Purpose: generic editor automation without specialized 2D/3D vertical helpers.

Includes:

- minimal foundation;
- scene/node/resource/script/signal/project/editor generic tools;
- object reflection tools already allowed by the existing safety model;
- permissions/risk controls;
- transactions and file checkpoints;
- `session.manifest`.

Excludes specialized 2D, 3D/material, navigation, UI/animation, TileMap/TileSet, runtime/debug/workflow and visual-capture verticals.

### `2d`

Purpose: focused 2D authoring.

Includes:

- minimal foundation;
- generic scene/node/resource/script/signal/project/editor authoring;
- permissions/risk controls and recovery/checkpoints;
- `node2d.*`, `sprite2d.*`, `camera2d.*`, `collision2d.*`, `parallax2d.*`;
- `tilemap.*`, `tileset.*`;
- `ui.*`, `animation.*`;
- unified `navigation.*` tools;
- `visual.capture_viewport_2d`;
- `session.manifest`.

It excludes raw `object.*` reflection and 3D/material/runtime/debug/workflow tools.

### `3d`

Purpose: focused 3D authoring.

Includes:

- minimal foundation;
- generic scene/node/resource/script/signal/project/editor authoring;
- permissions/risk controls and recovery/checkpoints;
- `node3d.*`, `mesh3d.*`, `camera3d.*`, `collision3d.*`, `light3d.*`;
- `material3d.*`, `shader3d.*`;
- `animation.*`;
- unified `navigation.*` tools;
- `visual.capture_viewport_3d`;
- `session.manifest`.

It excludes raw `object.*` reflection and 2D/TileMap/UI/runtime/debug/workflow tools.

### `navigation`

Purpose: navigation-focused scene authoring with the smallest useful generic editing base.

Includes:

- minimal foundation;
- scene/node/resource/editor generic tools;
- permissions/risk controls and recovery/checkpoints;
- all `navigation.*` tools;
- `session.manifest`.

It intentionally omits generic object reflection, runtime, UI, TileMap and unrelated 2D/3D power tools.

### `ui`

Purpose: Control/AnimationPlayer authoring.

Includes:

- minimal foundation;
- scene/node/resource/script/signal/editor generic tools;
- permissions/risk controls and recovery/checkpoints;
- `ui.*`, `animation.*`;
- `visual.capture_viewport_2d`;
- `session.manifest`.

### `runtime`

Purpose: run/debug/verification sessions with minimal editor-authoring noise.

Includes:

- minimal foundation;
- permissions/risk controls;
- `project.run`, `project.run_scene`, `project.stop`;
- `runtime.*`;
- `debug.*`;
- `visual.capture_game`;
- `workflow.*`;
- `session.manifest`.

It does not expose editor mutation or recovery tools.

### `full`

Purpose: complete backwards-compatible surface.

Includes every cataloged public tool.

## Tool domains

Every catalog entry has exactly one bounded domain used for discovery and profile composition. Domains describe tool purpose, not necessarily the literal first namespace segment:

```text
core
session
security
recovery
scene
node
object
resource
script
signal
project
editor
runtime
debug
visual
workflow
ui
animation
tilemap
tileset
2d
3d
materials
navigation
```

Examples:

- `project.run` belongs to `runtime`, not `project`;
- `editor.close_scene` belongs to `recovery` because its implementation is part of the recoverable editor/file safety surface;
- `session.manifest` belongs to `session`;
- `material3d.*` and `shader3d.*` belong to `materials`.

## Canonical catalog

The server owns a fixed catalog entry for every public tool:

```ts
interface ToolCatalogEntry {
  name: string;
  domain: ToolDomain;
  profiles: readonly ToolProfile[];
}
```

Descriptions stay in the existing registration functions. The runtime `ToolRegistry` captures those descriptions while registration declarations execute. This avoids copying prose into a second static source.

A server construction must fail if:

- a registration function declares a tool absent from the static catalog;
- the catalog contains duplicate names;
- an entry has no profiles;
- an entry is missing `full`;
- after full registration, a catalog entry was never observed.

The final condition is verified by tests, not by forcing every profile to activate every entry.

## Profile resolution

### Project configuration

`.godot-mcp/config.json` gains:

```json
{
  "toolProfile": "full"
}
```

The field is validated by the shared protocol `ToolProfileSchema` and defaults to `full`. Existing config files remain valid.

### Server command line

The Node server accepts:

```text
--tool-profile <minimal|core|2d|3d|navigation|ui|runtime|full>
```

Resolution order:

```text
explicit server --tool-profile
        >
project config toolProfile
        >
full default
```

### CLI

The CLI accepts `--tool-profile` for:

- `godot-mcp config`
- `godot-mcp start`

`config` persists the selected value and reports `restartRequired: true`. `start` provides a one-session override without rewriting project configuration.

Profiles cannot be changed through MCP tools.

## Discovery tool: `godot.tools`

`godot.tools` is available in every profile and is classified as a local read-only tool.

Input:

```json
{
  "profile": "3d",
  "domain": "navigation",
  "query": "mesh",
  "activeOnly": false,
  "offset": 0,
  "limit": 25
}
```

All fields are optional.

Rules:

- omitted `profile` means the current active profile;
- `domain` filters exact bounded domains;
- `query` performs a case-insensitive substring match against tool name and description and is capped at 80 characters;
- `activeOnly` defaults to `true` when `profile` is omitted and to `false` when an explicit profile is supplied;
- `offset` is `0..10000`;
- `limit` is `1..50`, default `25`;
- results are sorted by tool name;
- no Zod schemas, handlers, filesystem paths, permission state, or arbitrary reflection metadata are returned.

Result:

```json
{
  "activeProfile": "3d",
  "selectedProfile": "3d",
  "profiles": [
    { "id": "minimal", "toolCount": 5 },
    { "id": "3d", "toolCount": 107 },
    { "id": "full", "toolCount": 165 }
  ],
  "total": 12,
  "offset": 0,
  "limit": 25,
  "nextOffset": null,
  "tools": [
    {
      "name": "navigation.mesh.bake",
      "domain": "navigation",
      "description": "...",
      "active": true,
      "profiles": ["2d", "3d", "navigation", "full"]
    }
  ]
}
```

Tool counts are computed from the catalog; they are not hard-coded constants.

`active` always reflects the current server profile, even when inspecting another selected profile.

## MCP registration semantics

The server still calls every domain registration function exactly once during construction. The profile-aware registrar observes all declarations but forwards only active tools to `McpServer.registerTool`.

This is intentional:

- descriptions for inactive tools remain discoverable through `godot.tools`;
- catalog drift is visible during construction/tests;
- domain registration files require little or no profile-specific branching;
- switching profiles only changes the registrar configuration, not handlers.

The MCP tool list is immutable for the lifetime of the server instance.

## Security

- Profiles only reduce exposed surface; they never grant permissions.
- Existing `ToolPolicy` still evaluates every executed active tool.
- `godot.tools` is read-only and local; it does not require editor connectivity or filesystem access.
- A hidden tool cannot be invoked through MCP because it is not registered with the active `McpServer`.
- No profile bypasses risk approval, transaction barriers, reflection safety, or permission flags.
- Profile selection is startup/configuration state, not model-controlled session mutation.

## Compatibility with Phase 5 capabilities

Profiles and capabilities are orthogonal:

```text
Tool profile:        Is this MCP command exposed in this server session?
Godot capability:   Can the connected Godot build perform the underlying feature?
```

A `3d` profile may expose `navigation.mesh.bake`; the Phase 5 compatibility core may still report the specific Navigation capability unsupported on a different engine build. Handlers continue enforcing capabilities normally.

## Tests

Unit/contract coverage must verify:

- protocol schemas accept exactly the eight profile IDs and bounded discovery arguments/results;
- project config defaults to `full`, persists a profile and rejects invalid values;
- CLI parses valid `config/start --tool-profile` and rejects invalid/inapplicable uses;
- direct server parsing follows the same profile enum;
- every full-profile registered tool is present in the static catalog;
- every static catalog entry is observed during full server construction;
- uncataloged registration throws;
- `full` exposes the previous 164 tools plus `godot.tools`;
- `minimal` exposes exactly the five foundation tools listed above;
- specialized profiles include their promised domains and exclude representative unrelated tools;
- `godot.tools` paginates, filters, reports current/selected profile correctly, and remains read-only;
- default `createMcpServer()` behavior remains `full` for existing tests/callers;
- no profile changes existing tool schemas or handlers.

Integration coverage must start the server through the normal CLI/server path with a non-full profile and confirm `tools/list` reflects that profile while the editor handshake still succeeds. This is a server-surface integration test; no new Godot handler is required.

## Acceptance criteria

1. `full` remains the default and preserves all Phase 5 tools.
2. Exactly one new public MCP tool is added: `godot.tools`.
3. All public tools are represented by one canonical catalog with one domain and explicit profile membership.
4. Uncataloged tool declarations fail fast.
5. Profile selection is resolved before MCP server construction and remains immutable for the session.
6. `minimal`, `core`, `2d`, `3d`, `navigation`, `ui`, `runtime`, and `full` are all covered by tests.
7. `godot.tools` discovery is bounded, paginated, and useful for inactive tools without exposing schemas or arbitrary reflection.
8. Profiles never weaken the existing security/approval/recovery model.
9. Phase 5 compatibility/capability semantics remain unchanged.
10. Build, typecheck, unit, Godot syntax, standard integration, runtime integration, and visual integration remain green on the authoritative Windows Godot 4.6.3 environment.
