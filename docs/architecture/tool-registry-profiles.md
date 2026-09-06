# Tool registry, profiles and discovery

Phase 6 separates **which MCP tools are exposed** from **which Godot features the connected engine supports**.

- Tool profiles are a server-surface choice made before MCP server construction.
- Phase 5 capabilities are engine/runtime facts reported by the connected Godot addon.
- Profiles never override capability checks, permissions, approval, recovery barriers or reflection safety.

## Profiles

The server supports exactly eight profiles:

| Profile | Tools | Intended use |
| --- | ---: | --- |
| `minimal` | 5 | read-only orientation and discovery |
| `core` | 78 | generic editor automation without specialized verticals |
| `2d` | 121 | 2D, TileMap, UI/animation and navigation authoring |
| `3d` | 107 | 3D, materials, animation and navigation authoring |
| `navigation` | 67 | focused NavigationRegion/mesh/agent workflows |
| `ui` | 81 | Control layout and AnimationPlayer workflows |
| `runtime` | 38 | run/debug/capture/workflow verification plus headless Godot process control |
| `full` | 173 | complete surface; backwards-compatible default |

Counts include `godot.tools`, the Phase 6 discovery tool.

`full` remains the default so existing projects and MCP client configurations do not lose tools after upgrading.

## Selecting a profile

Project configuration stores the persistent default in `.godot-mcp/config.json`:

```json
{
  "protocol": 1,
  "bridgePort": 61337,
  "godotBin": "C:/Tools/Godot.exe",
  "toolProfile": "3d"
}
```

Use the CLI to persist a profile:

```powershell
godot-mcp config C:\path\to\project --tool-profile 3d
```

The change requires restarting the MCP server. A one-session override is available on `start`:

```powershell
godot-mcp start C:\path\to\project --tool-profile runtime
```

The Node server accepts the same override directly:

```powershell
node .\packages\server\dist\index.js --project C:\path\to\project --tool-profile navigation
```

Resolution is deterministic:

```text
--tool-profile override
        >
project config toolProfile
        >
full
```

The active profile does not change during the lifetime of an MCP server instance. There is deliberately no MCP tool for switching profiles.

## How registration works

Every existing domain registration function still declares its specialized tool normally. A central profile-aware registrar performs three operations for every declaration:

1. require a matching canonical catalog entry;
2. record the declaration description for discovery;
3. forward the tool to MCP only when the active profile includes it.

The server executes all registration declarations even for hidden tools, then verifies that every catalog entry was observed. This prevents drift in either direction:

- a new uncataloged tool fails server construction;
- a stale catalog entry with no corresponding declaration fails server construction.

The individual Zod schemas and handlers remain in their existing domain registrars. Phase 6 does not generate or merge handlers.

## `godot.tools`

`godot.tools` is available in every profile and does not require an editor connection.

Default call:

```json
{}
```

returns the tools active in the current profile, profile counts and compact metadata.

To inspect another profile without switching the current session:

```json
{
  "profile": "3d",
  "domain": "navigation",
  "query": "mesh",
  "offset": 0,
  "limit": 25
}
```

Discovery fields:

- `profile`: select a profile to inspect; omitted means the active profile;
- `domain`: exact bounded tool domain filter;
- `query`: case-insensitive substring over name and description, max 80 characters;
- `activeOnly`: when omitted, defaults to true for the current profile and false for an explicitly selected profile;
- `offset`: pagination offset, `0..10000`;
- `limit`: `1..50`, default `25`.

Results are alphabetically sorted and contain only:

- name;
- domain;
- description;
- whether the tool is active in the current session;
- profile membership.

No input schemas, handlers, arbitrary reflection data or permission state are exposed.

## Profile intent

### `minimal`

`session.status`, `godot.capabilities`, `godot.tools`, `project.info`, and `scene.get_tree` only.

### `core`

Adds generic scene/node/object/resource/script/signal/project/editor tools plus security, transactions/checkpoints and `session.manifest`.

### `2d`

Adds generic authoring, security/recovery, 2D helpers, TileMap/TileSet, UI, animation, navigation, 2D viewport capture and `session.manifest`. Raw `object.*` reflection and unrelated 3D/runtime tools stay hidden.

### `3d`

Adds generic authoring, security/recovery, 3D helpers, materials/shaders, animation, navigation, 3D viewport capture and `session.manifest`. Raw `object.*` reflection and unrelated 2D/runtime tools stay hidden.

### `navigation`

Adds scene/node/resource/editor authoring, security/recovery, navigation tools and `session.manifest` while omitting unrelated verticals.

### `ui`

Adds scene/node/resource/script/signal/editor authoring, security/recovery, UI/animation, 2D viewport capture and `session.manifest`.

### `runtime`

Adds security, runtime control/inspection, debug output, game capture, workflow verification, all eight `headless.*` tools and `session.manifest`; editor mutation and file recovery tools remain hidden.

## Security

Profiles are a visibility reduction, not authorization. An active tool still passes through the existing `ToolPolicy` and approval flow. Hidden tools are absent from MCP `tools/list` and therefore cannot be invoked through that server surface.

`godot.tools` is classified as a local read-only operation and performs no filesystem, editor or network-local RPC work.

## Relationship to future code generation

The catalog centralizes names/domains/profile membership now. It does **not** yet become the source for Zod schemas, registration boilerplate or documentation generation. That remains intentionally separate so Phase 6 can prove profile semantics before a later contract/codegen phase changes declaration ownership.
