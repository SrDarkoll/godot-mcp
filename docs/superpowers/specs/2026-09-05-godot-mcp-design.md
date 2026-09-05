# Godot MCP — Open-Source Design Specification

**Status:** Approved design, ready for implementation planning  
**Date:** 2026-09-05  
**Initial platform:** Windows  
**Godot target:** Godot 4.x  
**MCP server:** Node.js / TypeScript  
**Godot integration:** GDScript EditorPlugin + runtime debugger bridge  
**License:** MIT  
**Primary tested client:** Codex  

## 1. Purpose

Godot MCP is an open-source Model Context Protocol server and Godot 4.x integration that gives an MCP-compatible coding agent deep, structured control over a Godot project.

The project is intended to let an agent such as Codex inspect, modify, execute, observe, debug, and iteratively correct a Godot project without relying on simulated mouse or keyboard input.

The system must support both:

1. **Editor mode** — Godot Editor is open and the MCP communicates with an installed project addon.
2. **Headless mode** — Godot Editor is closed and the MCP controls the project through the Godot command-line interface and project files.

The first release is Windows-only, generic across Godot 4.x projects, open-source, and reusable by the community.

## 2. Goals

The first production-oriented architecture must:

- work with arbitrary Godot 4.x projects;
- use standard MCP transport toward the client;
- expose high-level Godot tools backed by generic introspection primitives;
- control scenes, nodes, resources, scripts, project settings, runtime, debugger, and visual capture;
- support 2D and 3D editor viewport screenshots and running-game screenshots;
- persist screenshots and session artifacts instead of deleting them automatically;
- support safe transactions, rollback, Undo/Redo integration, checkpoints, and audit logs;
- run in both editor-connected and headless modes;
- support one active Godot project/instance at a time;
- default to project-scoped access;
- allow additional dangerous permissions to be enabled by the agent for the current session only;
- classify actions as normal, risky, or blocked;
- require confirmation for risky destructive operations;
- remain client-agnostic enough to support MCP clients beyond Codex later;
- ship with automated tests, fixtures, documentation, and a CLI suitable for open-source distribution.

## 3. Non-goals for the first release

The initial release will not:

- support Godot 3.x;
- support Linux or macOS;
- simulate mouse or keyboard input as a normal control mechanism;
- depend on C#/.NET inside Godot;
- support multiple simultaneously active projects;
- require Git for recovery or normal operation;
- depend on any single MCP client internally;
- expose unrestricted arbitrary GDScript execution as the main RPC interface.

UI automation may be considered in the future as an optional fallback, but it is explicitly excluded from the first release.

## 4. High-level architecture

```text
                         MCP CLIENT
                         (Codex)
                            │
                            │ MCP stdio
                            ▼
                ┌─────────────────────┐
                │   Node MCP Server   │
                ├─────────────────────┤
                │ Tool registry       │
                │ Protocol schemas    │
                │ Session manager     │
                │ Permissions         │
                │ Risk engine         │
                │ Transactions        │
                │ Visual policy       │
                │ Headless manager    │
                └─────────┬───────────┘
                          │
                          │ WebSocket, localhost only
                          ▼
              ┌─────────────────────────┐
              │ Godot 4 EditorPlugin    │
              ├─────────────────────────┤
              │ Editor bridge           │
              │ Scene bridge            │
              │ Object bridge           │
              │ Resource bridge         │
              │ Visual bridge           │
              │ Undo/Redo integration   │
              │ Debugger bridge         │
              └──────────┬──────────────┘
                         │
                         │ EngineDebugger / debugger messages
                         ▼
              ┌─────────────────────────┐
              │      Running Game       │
              ├─────────────────────────┤
              │ Runtime scene tree      │
              │ Runtime inspection      │
              │ Runtime mutation        │
              │ Debug output            │
              │ Metrics                 │
              │ Screenshots             │
              └─────────────────────────┘
```

When the editor is not running:

```text
MCP Client
   ↓
Node MCP Server
   ↓
GodotProcessManager
   ↓
godot.exe --headless ...
   ↓
Project
```

## 5. Repository layout

The repository will be a Node.js monorepo.

```text
godot-mcp/
│
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── mcp/
│   │   │   ├── tools/
│   │   │   ├── sessions/
│   │   │   ├── permissions/
│   │   │   ├── risk/
│   │   │   ├── transactions/
│   │   │   ├── visual/
│   │   │   ├── headless/
│   │   │   └── godot/
│   │   └── package.json
│   │
│   ├── cli/
│   │   └── src/
│   │       ├── init/
│   │       ├── doctor/
│   │       ├── config/
│   │       ├── sessions/
│   │       └── addon/
│   │
│   ├── protocol/
│   │   └── src/
│   │       ├── messages/
│   │       ├── types/
│   │       ├── schemas/
│   │       └── errors/
│   │
│   └── godot-addon/
│       └── addons/
│           └── godot_mcp/
│               ├── plugin.cfg
│               ├── plugin.gd
│               ├── bridge/
│               ├── editor/
│               ├── runtime/
│               ├── debugger/
│               ├── visual/
│               ├── serialization/
│               └── transactions/
│
├── tests/
│   ├── unit/
│   ├── protocol/
│   ├── integration/
│   └── e2e/
│
├── fixtures/
│   ├── empty-project/
│   ├── project-2d/
│   ├── project-3d/
│   └── broken-project/
│
├── examples/
│   ├── platformer-2d/
│   ├── arena-3d/
│   └── ui-demo/
│
├── docs/
│   ├── installation/
│   ├── architecture/
│   ├── tools/
│   ├── protocol/
│   ├── security/
│   └── superpowers/specs/
│
├── scripts/
├── package.json
├── tsconfig.json
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## 6. Installation model

The MCP server and CLI are installed once on Windows. The Godot addon is installed per project.

Expected workflow:

```powershell
git clone <repository>
cd godot-mcp
npm install
npm run build
npm run setup
```

Inside a Godot project:

```powershell
godot-mcp init
```

This installs or updates:

```text
<project>/addons/godot_mcp/
<project>/.godot-mcp/config.json
<project>/.godot-mcp/sessions/
```

The project-local addon approach ensures each project explicitly contains the bridge version it uses.

## 7. CLI design

The first release should provide:

```text
godot-mcp init
godot-mcp doctor
godot-mcp status
godot-mcp start
godot-mcp stop
godot-mcp config
godot-mcp permissions

godot-mcp sessions list
godot-mcp sessions inspect <id>
godot-mcp sessions clean <id|all>

godot-mcp addon install
godot-mcp addon update
godot-mcp addon remove

godot-mcp setup codex
```

`doctor` must validate at least:

- Node.js availability;
- Godot executable location;
- Godot version compatibility;
- project validity;
- addon presence/version;
- MCP registration for Codex when requested;
- editor connection status;
- runtime bridge status.

## 8. MCP tool philosophy

The MCP must use a hybrid model:

1. **High-level tools** for common Godot tasks.
2. **Generic introspection primitives** that avoid hardcoding every Godot class and property.

The project must not become a catalog of hundreds of one-off tools.

Representative generic tools:

```text
object.get_class
object.get_property_list
object.get_method_list
object.get_signal_list
object.inspect
object.get
object.set
object.call
```

Representative high-level tools:

```text
project.*
scene.*
node.*
resource.*
script.*
signal.*
asset.*
ui.*
animation.*
shader.*
navigation.*
physics.*
editor.*
runtime.*
debug.*
visual.*
transaction.*
checkpoint.*
session.*
permissions.*
```

## 9. Project capabilities

The MCP should support:

```text
project.create
project.open
project.info
project.settings.get
project.settings.set
project.input.add_action
project.input.remove_action
project.autoload.add
project.autoload.remove
project.run
project.run_scene
project.stop
project.reload
project.import
project.validate
```

Project creation must support creating a new Godot 4.x project from scratch and automatically installing/enabling the addon where appropriate.

## 10. Scene capabilities

```text
scene.create
scene.open
scene.save
scene.save_as
scene.reload
scene.get_tree
scene.get_root
scene.instantiate
scene.pack
```

Scene mutations should participate in Godot Undo/Redo where possible.

## 11. Node and object capabilities

```text
node.create
node.delete
node.duplicate
node.rename
node.reparent
node.move
node.inspect
node.list_children
node.get_property
node.set_property
node.get_properties
node.call_method
```

Object introspection must expose enough metadata for unknown future Godot classes, third-party addon classes, and user scripts to remain usable without server-side hardcoding.

## 12. Script capabilities

```text
script.create
script.attach
script.detach
script.inspect
script.validate
script.get_methods
script.get_properties
script.get_signals
script.parse
script.get_diagnostics
```

The MCP may edit source files directly, but validation must use Godot-aware diagnostics where available.

## 13. Signal capabilities

```text
signal.list
signal.connect
signal.disconnect
signal.connections
signal.emit
```

Signal changes should be inspected before destructive rewiring and included in transaction logs.

## 14. Resource capabilities

```text
resource.load
resource.create
resource.inspect
resource.save
resource.duplicate
resource.set_property
```

The resource layer must remain generic enough to support built-in and custom `Resource` subclasses.

## 15. Asset capabilities

```text
asset.list
asset.inspect
asset.import
asset.reimport
asset.move
asset.rename
asset.dependencies
```

The MCP must wait for relevant Godot import operations to complete before depending on imported resources.

## 16. 2D capabilities

The system should work generically with 2D nodes and additionally provide higher-level helpers for common workflows involving:

- Sprite2D;
- AnimatedSprite2D;
- CharacterBody2D;
- RigidBody2D;
- StaticBody2D;
- Area2D;
- Camera2D;
- CollisionShape2D;
- Polygon2D;
- Line2D;
- parallax systems;
- TileMap/TileSet APIs available in the installed Godot 4.x version.

Representative tools:

```text
tilemap.inspect
tilemap.get_cells
tilemap.set_cell
tilemap.erase_cell
tilemap.paint_region
tileset.inspect
tileset.create_source
tileset.create_atlas
tileset.configure_tile
```

## 17. 3D capabilities

The generic layer should support all normal Node3D subclasses. Higher-level helpers should cover common workflows involving:

- MeshInstance3D;
- CharacterBody3D;
- RigidBody3D;
- StaticBody3D;
- Area3D;
- Camera3D;
- Light3D;
- WorldEnvironment;
- NavigationRegion3D;
- CollisionShape3D;
- CSG nodes;
- Skeleton3D.

## 18. UI capabilities

The MCP must understand Godot `Control` layout semantics rather than only treating UI elements as arbitrary nodes.

Representative tools:

```text
ui.inspect_layout
ui.set_anchor
ui.set_offset
ui.set_container
ui.set_focus
ui.set_theme
```

The system should expose anchor, offset, minimum-size, focus, container, and theme information in a form suitable for agent reasoning.

## 19. Animation capabilities

```text
animation.list
animation.create
animation.delete
animation.inspect
animation.add_track
animation.remove_track
animation.add_key
animation.remove_key
animation.play
animation.stop
animation.seek
```

Primary targets are `AnimationPlayer` and `AnimationTree`, while lower-level object/resource primitives remain available for unsupported cases.

## 20. Shader capabilities

```text
shader.create
shader.inspect
shader.validate
shader.assign
```

Shader source should be validated by Godot before a transaction is considered successfully committed when validation is applicable.

## 21. Navigation and physics capabilities

Representative tools:

```text
navigation.inspect
navigation.bake
navigation.get_regions
navigation.validate

physics.inspect_layers
physics.inspect_collision
physics.debug_enable
```

These tools should help diagnose semantic game problems, not only syntax errors.

## 22. Editor capabilities

When the Godot editor is connected:

```text
editor.get_active_scene
editor.get_selected_nodes
editor.select_node
editor.get_open_scenes
editor.change_scene
editor.get_filesystem
editor.scan_filesystem
editor.undo
editor.redo
editor.get_errors
editor.get_output
```

The design intentionally manipulates editor state through official APIs rather than mouse/keyboard simulation.

## 23. Runtime capabilities

The runtime bridge should expose:

```text
runtime.status
runtime.scene_tree
runtime.inspect_node
runtime.get_property
runtime.set_property
runtime.call_method
runtime.pause
runtime.resume
runtime.restart
runtime.stop
```

Runtime mutations are temporary unless explicitly persisted to project data.

## 24. Debugger capabilities

Representative tools:

```text
debug.errors
debug.warnings
debug.output
debug.stack
debug.breakpoints
debug.inspect
debug.performance
```

Where available, the MCP should expose metrics such as FPS, frame time, draw calls, node/object counts, and memory use.

## 25. Transport and internal protocol

### 25.1 Client to server

The MCP client communicates with the Node.js server using standard MCP transport, initially `stdio`.

### 25.2 Server to editor

The Node.js server communicates with the project addon over a WebSocket bound only to `127.0.0.1`.

### 25.3 Editor to runtime

Runtime communication should use Godot debugger facilities such as debugger messages between the editor plugin and running game where feasible.

### 25.4 Structured RPC

The internal protocol must use structured messages, not arbitrary executable GDScript strings.

Example request:

```json
{
  "id": "req-184",
  "protocol": 1,
  "method": "node.set_property",
  "params": {
    "node_path": "/root/Main/Player",
    "property": "speed",
    "value": {
      "type": "float",
      "value": 8.0
    }
  }
}
```

Example success:

```json
{
  "id": "req-184",
  "ok": true,
  "result": {
    "previous_value": 6.0,
    "new_value": 8.0
  }
}
```

Example failure:

```json
{
  "id": "req-184",
  "ok": false,
  "error": {
    "code": "PROPERTY_NOT_FOUND",
    "message": "Property 'speed' does not exist.",
    "object_class": "CharacterBody3D"
  }
}
```

Error responses must be structured and actionable.

## 26. Variant serialization

The protocol must provide canonical serialization for common Godot Variant types, including:

- Vector2, Vector3, Vector4;
- Vector2i, Vector3i, Vector4i;
- Transform2D, Transform3D;
- Basis;
- Quaternion;
- Rect2, Rect2i;
- Color;
- NodePath;
- StringName;
- RID where meaningful;
- arrays and dictionaries;
- packed arrays;
- object/resource references using stable reference descriptors rather than arbitrary raw memory identifiers.

Typed values must not be flattened into ambiguous strings.

Example:

```json
{
  "type": "Vector3",
  "value": {
    "x": 3,
    "y": 2,
    "z": 7
  }
}
```

Protocol round-trip tests are required for every supported Variant type.

## 27. Capability negotiation

On connection, the addon must advertise at least:

- Godot version;
- addon version;
- protocol version;
- editor capability;
- runtime capability;
- debugger capability;
- 2D viewport capture capability;
- 3D viewport capture capability;
- Undo/Redo capability;
- feature flags for APIs that differ across Godot 4.x releases.

The server must not assume every Godot 4.x version exposes identical APIs.

## 28. Session model

Only one project is active at a time.

A session tracks:

```text
session id
project root
Godot version
addon version
protocol version
editor connected?
runtime connected?
active scene
active transaction
permissions
risk policy
screenshot counters
audit logger
```

Representative tool:

```text
session.status
```

## 29. Permission model

Default session permissions:

```text
filesystem.project       = true
filesystem.external      = false
process.godot            = true
process.shell            = false
process.external         = false
network.local            = true
network.external         = false
editor.modify            = true
runtime.modify           = true
```

Dangerous permissions may be enabled or disabled by the agent through MCP tools.

However:

- dangerous permission changes apply only to the current session;
- they reset to safe defaults when the MCP server/session restarts;
- every change is recorded in the audit log.

Representative tools:

```text
permissions.status
permissions.enable
permissions.disable
permissions.set
```

Permission state and action risk classification are separate concepts.

## 30. Risk model

Every mutating action is classified into one of three levels.

### NORMAL

Examples:

- create node;
- change normal node properties;
- edit script;
- create scene;
- create resource;
- run project;
- capture screenshot.

Normal actions may execute automatically.

### RISKY

Examples:

- delete scene/resource/file;
- rename referenced resources;
- bulk file moves;
- autoload changes;
- substantial project settings changes;
- overwrite existing resources;
- release export.

Risky actions require explicit confirmation before execution.

### BLOCKED

Examples:

- arbitrary shell execution without permission;
- external filesystem writes without permission;
- deletion outside project scope;
- execution of unapproved external binaries;
- other sensitive external actions.

Blocked actions require the appropriate session permission and may still be considered risky after permission is granted.

## 31. Project scope enforcement

The server resolves a canonical project root and normalizes all file paths before access.

Any project-scoped file operation must verify that the normalized target remains inside the active project root.

Path traversal such as `../../` must never escape project scope unless `filesystem.external` is enabled and the action passes the risk policy.

## 32. Transactions

Logical changes should be grouped into transactions.

Example:

```text
Transaction #184 — Create player controller
├── Create CharacterBody3D
├── Create CollisionShape3D
├── Create MeshInstance3D
├── Set position
├── Attach player.gd
└── Save Main.tscn
```

Transaction lifecycle:

```text
BEGIN
  ↓
Snapshot affected state
  ↓
Apply changes
  ↓
Validate
  ↓
COMMIT or ROLLBACK
```

Representative tools:

```text
transaction.begin
transaction.preview
transaction.commit
transaction.rollback
transaction.status
```

## 33. Undo/Redo integration

Editor-side mutations must use `EditorUndoRedoManager` where practical so MCP actions integrate with native Godot Undo/Redo history.

A logical MCP transaction should appear as a meaningful grouped action where possible, not as dozens of unrelated history entries.

## 34. File snapshots

Operations that edit files outside native editor Undo/Redo require transaction snapshots.

Session layout:

```text
.godot-mcp/
└── sessions/
    └── <session-id>/
        └── transactions/
            └── tx_0184/
                ├── before/
                ├── after/
                └── transaction.json
```

Snapshots must include only files affected by the transaction unless a larger checkpoint is explicitly requested.

## 35. Validation and automatic rollback

Validation level depends on the operation.

Examples:

- simple property change: property/type validity;
- script change: syntax/diagnostics;
- scene change: scene/resource validity;
- multi-file feature: syntax, dependency, scene, and debugger checks;
- visual feature: optional run and visual checkpoint.

When a transaction is configured as atomic and validation fails, the default behavior is rollback.

## 36. Transaction preview / dry run

Before mutation, the server should be able to report:

- files that would be created;
- files that would be modified;
- files that would be deleted;
- scene/resource targets;
- permission requirements;
- risk level;
- rollback availability.

This is the basis of `transaction.preview` and is also used by the risk engine.

## 37. Checkpoints

Checkpoints provide recovery at a larger scope than transactions.

Representative tools:

```text
checkpoint.create
checkpoint.list
checkpoint.restore
checkpoint.inspect
```

Conceptually:

```text
Undo                → recent editor operation
Transaction rollback → one logical MCP change
Checkpoint           → known project state spanning many transactions
```

Git may be used optionally for status/diff information, but checkpoints must not depend on Git.

## 38. Concurrency

The system supports one active project but may receive overlapping MCP requests.

The server therefore needs project-level coordination:

- read operations may run concurrently when safe;
- conflicting writes are serialized;
- transactions hold appropriate write locks;
- operations must not observe half-applied mutating transactions.

## 39. Audit log

Every significant mutation and permission change must be recorded.

Example mutation record:

```json
{
  "id": 391,
  "timestamp": "2026-09-05T00:31:17-05:00",
  "tool": "node.set_property",
  "target": "/root/Main/Player",
  "property": "speed",
  "old_value": 6.0,
  "new_value": 8.0,
  "risk": "normal",
  "transaction": 184
}
```

Permission changes must record old and new values and indicate session-only scope.

## 40. Visual capture architecture

The MCP must support visual feedback without desktop UI automation.

### Editor 2D

Capture the 2D editor SubViewport when the installed Godot version exposes it.

```text
visual.capture_editor_2d
```

### Editor 3D

Capture an available 3D editor SubViewport.

```text
visual.capture_editor_3d
```

The tool may accept a viewport index if multiple 3D editor viewports are active.

### Running game

Capture the running game's viewport using the runtime bridge.

```text
visual.capture_game
```

Captures must occur after a rendered frame when necessary to avoid stale or empty output.

## 41. Visual checkpoint policy

Default policy:

```text
ON_RUN                  = true
AFTER_VISUAL_CHANGE     = true
AFTER_VISUAL_FIX        = true
BEFORE_MAJOR_CHANGE     = true
AFTER_MAJOR_CHANGE      = true
ON_ERROR                = configurable
MANUAL_REQUEST          = true
EVERY_TOOL_CALL         = false
```

The goal is useful visual traceability without creating a screenshot after every trivial property mutation.

## 42. Persistent session artifacts

Screenshots and session artifacts are never deleted automatically.

Default layout:

```text
.godot-mcp/
└── sessions/
    └── <session-id>/
        ├── screenshots/
        │   ├── editor/
        │   ├── game/
        │   └── runtime/
        ├── transactions/
        ├── checkpoints/
        ├── logs/
        ├── events/
        ├── artifacts/
        └── manifest.json
```

Screenshot names should be ordered and descriptive, for example:

```text
0001_initial_level.png
0002_player_spawn.png
0003_camera_fixed.png
```

## 43. Session manifest

`manifest.json` acts as a session index and trace.

It should contain at least:

- session id;
- project;
- Godot version;
- addon/protocol versions;
- start/end timestamps;
- screenshots with type, path, scene, reason, transaction, and timestamp;
- transaction summaries;
- checkpoints;
- relevant errors;
- permission changes.

## 44. Headless mode

When the editor is unavailable, the Node server may invoke the configured Godot executable for headless operations.

Representative tools:

```text
headless.validate_project
headless.import
headless.run
headless.run_scene
headless.run_tests
headless.get_output
```

Headless mode must not pretend to expose editor-only capabilities. Capability negotiation determines what is available.

## 45. Autonomous development loop

The intended agent loop is:

```text
Inspect project
   ↓
Plan logical change
   ↓
Risk + permission check
   ↓
Begin transaction
   ↓
Modify Godot/project
   ↓
Validate
   ↓
Run scene/project when useful
   ↓
Read debugger/logs
   ↓
Capture visual checkpoint when useful
   ↓
Analyze result
   ├─ success → commit/continue
   └─ failure → correct or rollback
```

This loop is a core product behavior, not merely a demo scenario.

## 46. Testing strategy

### 46.1 Unit tests

Node-side unit tests cover:

- permission evaluation;
- path normalization/scope enforcement;
- risk classification;
- RPC schema validation;
- transaction state machines;
- session manifest generation;
- lock behavior;
- screenshot naming/policy;
- error conversion.

### 46.2 Protocol tests

Round-trip serialization tests cover every supported Godot Variant mapping.

### 46.3 Integration tests

Godot fixtures are launched automatically to verify real addon/server interaction.

Representative test:

```text
start Godot fixture
connect addon
create Node2D
set position
attach script
save scene
reload scene
inspect node
assert state
```

### 46.4 End-to-end tests

Representative E2E flow:

```text
create empty project
godot-mcp init
start Godot
create Main.tscn
create Sprite2D
create/attach script
run
capture screenshot
read debugger output
stop
assert artifacts
```

### 46.5 Broken project fixtures

Fixtures intentionally include:

- GDScript syntax errors;
- missing resources;
- broken signals;
- invalid NodePaths;
- cyclic dependencies where meaningful;
- missing main scene;
- failed imports.

The MCP must return structured failures and preserve rollback information.

## 47. Continuous integration

GitHub Actions should run, where applicable:

- install;
- lint;
- TypeScript type checking;
- unit tests;
- protocol tests;
- build;
- headless Godot integration tests;
- headless E2E tests.

Editor-GUI-specific Windows tests may run in a separate workflow or test tier.

## 48. Open-source project requirements

The repository should include:

- MIT license;
- README with project status and quick start;
- CONTRIBUTING.md;
- SECURITY.md;
- CODE_OF_CONDUCT.md;
- CHANGELOG.md;
- architecture documentation;
- protocol documentation;
- tool reference;
- installation guide;
- example projects;
- test fixtures;
- GitHub issue/PR templates when the repository is published.

No user-specific paths, credentials, project names, tokens, or local configuration belong in committed source.

Project-local `.godot-mcp/sessions/` data should be ignored by Git by default even though it persists locally.

## 49. Compatibility strategy

Initial compatibility target:

```text
Operating system: Windows
Godot:           4.x
MCP server:      Node.js / TypeScript
Godot addon:     GDScript
Primary client:  Codex
License:         MIT
```

The protocol and server architecture should remain portable enough to add Linux, macOS, and additional MCP clients in later releases without redesigning the Godot bridge.

## 50. Design principles

1. **Native APIs before UI automation.**
2. **Structured RPC before arbitrary code execution.**
3. **Generic introspection plus ergonomic high-level tools.**
4. **Safe by default, with explicit session-scoped elevation.**
5. **Recoverability before autonomy.**
6. **One active project for deterministic behavior.**
7. **Visual verification as a first-class capability.**
8. **Persistent traceability through sessions, screenshots, manifests, and audit logs.**
9. **No Git dependency for core recovery.**
10. **Open protocol and client decoupling so Codex is the first client, not the architecture.**

## 51. Acceptance criteria for the first meaningful milestone

A first end-to-end milestone is considered successful when, on Windows with a supported Godot 4.x installation, Codex can through MCP:

1. initialize an arbitrary Godot project;
2. connect to the editor addon;
3. inspect the active scene tree;
4. create and modify nodes through structured tools;
5. create or modify a GDScript file;
6. attach the script to a node;
7. save and reload the scene;
8. run the project;
9. receive structured runtime/debug output;
10. capture and persist a game screenshot;
11. capture and persist an editor 2D or 3D viewport screenshot when supported;
12. perform an atomic multi-step change and roll it back;
13. record the operation in the session audit trail;
14. operate in headless validation mode when the editor is closed;
15. reset dangerous permissions when the MCP session ends.

This milestone proves the central thesis: an MCP agent can manipulate, execute, observe, and recover a Godot project without desktop input simulation.

## 52. Deferred work

Deferred until after the first stable Windows implementation:

- Linux and macOS support;
- multi-project/multi-instance orchestration;
- optional desktop UI control fallback;
- richer visual comparison/diffing;
- automatic asset-generation integrations;
- collaborative multi-agent project locking;
- remote/networked Godot instances;
- plugin marketplace/distribution automation;
- first-class support documentation for additional MCP clients.

