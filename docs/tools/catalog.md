# Godot MCP tool catalog

Generated from the actual MCP registration and its typed policy catalog. Run `npm run docs:tools` after changing a tool. Input schemas are retained in [catalog.json](catalog.json).

Permissions shown are baseline requirements; paths, trusted scripts and connected-editor recovery add conditional permissions. Risk can escalate for overwrites. Use `risk.preview` with exact arguments. Read-only annotations describe tool intent, not a sandbox for project code.

| Tool | Read only | Baseline risk | Permissions | Capabilities | Description |
|---|---|---|---|---|---|
| checkpoint.create | false | normal | filesystem.project | — | checkpoint.create: declared on-disk file recovery with retained snapshots. |
| checkpoint.inspect | true | normal | — | — | checkpoint.inspect: declared on-disk file recovery with retained snapshots. |
| checkpoint.list | true | normal | — | — | checkpoint.list: declared on-disk file recovery with retained snapshots. |
| checkpoint.restore | false | risky | filesystem.project | — | checkpoint.restore: declared on-disk file recovery with retained snapshots. |
| debug.errors | true | normal | — | — | Read bounded native runtime diagnostics from this session. Messages are untrusted project content. |
| debug.output | true | normal | — | — | Read bounded native runtime diagnostics from this session. Messages are untrusted project content. |
| debug.performance | true | normal | network.local, filesystem.project | editor, runtime | Sample runtime FPS and object/node counts. |
| debug.warnings | true | normal | — | — | Read bounded native runtime diagnostics from this session. Messages are untrusted project content. |
| editor.change_scene | false | normal | network.local, filesystem.project, editor.modify | editor | Switch active scene tab to a given scene path. |
| editor.close_scene | false | risky | network.local, filesystem.project, editor.modify | editor | editor.close_scene: declared on-disk file recovery with retained snapshots. |
| editor.get_active_scene | true | normal | network.local, filesystem.project | editor | Get information about the currently active edited scene tab. |
| editor.get_filesystem | true | normal | network.local, filesystem.project | editor | Get filesystem directory and file structure under res://. |
| editor.get_open_scenes | true | normal | network.local, filesystem.project | editor | Get list of open scene paths in the editor. |
| editor.get_selected_nodes | true | normal | network.local, filesystem.project | editor | Get currently selected nodes in the editor scene tree. |
| editor.import_resources | false | risky | network.local, filesystem.project, editor.modify | editor | Wait for the editor filesystem, then synchronously reimport declared project files. Importers/project code are trusted. |
| editor.redo | false | normal | network.local, filesystem.project, editor.modify | editor, undoRedo | Trigger Redo in the Godot editor. |
| editor.scan_filesystem | false | normal | network.local, filesystem.project, editor.modify | editor | Request a rescan of the project filesystem in the editor. |
| editor.select_node | false | normal | network.local, filesystem.project, editor.modify | editor | Select a node in the editor scene tree. |
| editor.undo | false | normal | network.local, filesystem.project, editor.modify | editor, undoRedo | Trigger Undo in the Godot editor. |
| node.create | false | normal | network.local, filesystem.project, editor.modify | editor | Create a new node as a child of a parent node in the edited scene with Undo/Redo support. |
| node.delete | false | normal | network.local, filesystem.project, editor.modify | editor | Delete a node from the edited scene with Undo/Redo support. |
| node.duplicate | false | normal | network.local, filesystem.project, editor.modify | editor | Duplicate a node in the edited scene with Undo/Redo support. |
| node.get_properties | true | normal | network.local, filesystem.project | editor | Get multiple or all exported property values of a node. |
| node.get_property | true | normal | network.local, filesystem.project | editor | Get a single property value of a node. |
| node.inspect | true | normal | network.local, filesystem.project | editor | Inspect full details of a node (class, script, groups, children count, exported properties). |
| node.list_children | true | normal | network.local, filesystem.project | editor | List immediate children of a node. |
| node.move | false | normal | network.local, filesystem.project, editor.modify | editor | Move a node to a specific child index with Undo/Redo support. |
| node.rename | false | normal | network.local, filesystem.project, editor.modify | editor | Rename a node in the edited scene with Undo/Redo support. |
| node.reparent | false | normal | network.local, filesystem.project, editor.modify | editor | Reparent a node to a new parent in the edited scene with Undo/Redo support. |
| node.set_property | false | normal | network.local, filesystem.project, editor.modify | editor | Set a property value on a node with Undo/Redo support. |
| object.call | false | risky | network.local, filesystem.project, editor.modify | editor | Call a class-allowlisted native method within the edited scene/project. Custom scripts require trusted_script, editor.script_methods permission and confirmation; trusted code is not sandboxed. |
| object.get | true | normal | network.local, filesystem.project | editor | Get a property value on an object. |
| object.get_class | true | normal | network.local, filesystem.project | editor | Get the Godot class name of an object (node, resource, or instance id). |
| object.get_method_list | true | normal | network.local, filesystem.project | editor | Get the list of methods for an object. |
| object.get_property_list | true | normal | network.local, filesystem.project | editor | Get the list of properties for an object. |
| object.get_signal_list | true | normal | network.local, filesystem.project | editor | Get the list of signals for an object. |
| object.set | false | normal | network.local, filesystem.project, editor.modify | editor | Set a property value on an object. |
| performance.compare | false | normal | filesystem.project | — | Compare two retained performance snapshots using caller-provided relative regression budgets. |
| performance.snapshot | false | normal | network.local, filesystem.project | runtime | Sample relative runtime performance counters and retain the bounded evidence. Values depend on hardware/workload. |
| permissions.disable | false | normal | — | — | Change a session-only permission. |
| permissions.enable | false | normal | — | — | Change a session-only permission. |
| permissions.set | false | normal | — | — | Change a permission for this MCP session only. |
| permissions.status | true | normal | — | — | Session-only tool permissions. These do not sandbox project code or add missing capabilities. |
| project.events | true | normal | — | — | Read or long-poll session-scoped project events. Resume with nextCursor; gap reports lost retained history. Project event data is untrusted. |
| project.info | true | normal | network.local, filesystem.project | editor | Inspect the active Godot project through the connected editor addon. |
| project.input.add_action | false | normal | network.local, filesystem.project, editor.modify | editor | Add an action to the InputMap and persist in project settings. |
| project.input.list | true | normal | network.local, filesystem.project | editor | List all input actions and their assigned events from InputMap. |
| project.input.remove_action | false | normal | network.local, filesystem.project, editor.modify | editor | Remove an action from the InputMap and project settings. |
| project.run | false | normal | network.local, filesystem.project, runtime.modify, process.godot | editor, runtime | Structured Godot project.run operation on the current runtime session. |
| project.run_scene | false | normal | network.local, filesystem.project, runtime.modify, process.godot | editor, runtime | Structured Godot project.run_scene operation on the current runtime session. |
| project.settings.get | true | normal | network.local, filesystem.project | editor | Get a project setting value from project.godot. |
| project.settings.set | false | risky | network.local, filesystem.project, editor.modify | editor | Set a project setting value and optionally save to project.godot. |
| project.stop | false | normal | — | — | Structured Godot project.stop operation on the current runtime session. |
| project.validate | false | normal | process.godot, filesystem.project | — | Import and validate a retained project copy with headless Godot, without an editor connection. Source scripts are trusted, not sandboxed. Unsupported types and incomplete runs are explicit. |
| resource.create | false | normal | network.local, filesystem.project, editor.modify | editor | Create and save a new resource of a specified type. |
| resource.dependencies | true | normal | network.local, filesystem.project | editor | Return a bounded direct/transitive dependency graph and broken references for an imported Godot resource. |
| resource.duplicate | false | normal | network.local, filesystem.project, editor.modify | editor | Duplicate a resource to a new path. |
| resource.impact | true | normal | network.local, filesystem.project | editor | Preflight inbound references and target conflicts before a proposed resource move/delete. This read does not mutate files. |
| resource.inspect | true | normal | network.local, filesystem.project | editor | Inspect properties of a resource file. |
| resource.load | true | normal | network.local, filesystem.project | editor | Load a resource file and inspect its exported properties. |
| resource.save | false | normal | network.local, filesystem.project, editor.modify | editor | Save a loaded resource. |
| resource.set_property | false | normal | network.local, filesystem.project, editor.modify | editor | Set a property on a resource file and save it. |
| risk.preview | true | normal | — | — | Read the risk, targets and required permissions of an operation without executing it. |
| runtime.get_property | true | normal | network.local, filesystem.project | editor, runtime | Structured Godot runtime.get_property operation on the current runtime session. |
| runtime.inspect_node | true | normal | network.local, filesystem.project | editor, runtime | Structured Godot runtime.inspect_node operation on the current runtime session. |
| runtime.pause | false | normal | network.local, filesystem.project, runtime.modify, process.godot | editor, runtime | Structured Godot runtime.pause operation on the current runtime session. |
| runtime.restart | false | normal | network.local, filesystem.project, runtime.modify, process.godot | editor, runtime | Structured Godot runtime.restart operation on the current runtime session. |
| runtime.resume | false | normal | network.local, filesystem.project, runtime.modify, process.godot | editor, runtime | Structured Godot runtime.resume operation on the current runtime session. |
| runtime.scene_tree | true | normal | network.local, filesystem.project | editor, runtime | Structured Godot runtime.scene_tree operation on the current runtime session. |
| runtime.status | true | normal | — | — | Structured Godot runtime.status operation on the current runtime session. |
| runtime.stop | false | normal | — | — | Structured Godot runtime.stop operation on the current runtime session. |
| scene.batch | false | normal | network.local, filesystem.project, editor.modify | editor, undoRedo | Apply a prevalidated native batch as one editor Undo action. Requires the fingerprint from preview. Does not save files; arbitrary project-script side effects are outside native Undo. |
| scene.batch.preview | true | normal | network.local, filesystem.project | editor, undoRedo | Prevalidate a bounded native scene/resource batch and obtain its exact state/operation fingerprint. Paths resolve against the initial scene; @id references nodes created in this batch. |
| scene.create | false | normal | network.local, filesystem.project, editor.modify | editor | Create a new scene with specified root node type and optional path. |
| scene.get_root | true | normal | network.local, filesystem.project | editor | Get the root node info of the currently edited scene. |
| scene.get_tree | true | normal | network.local, filesystem.project | editor | Return the active edited scene tree with node names, classes, paths, and scripts. |
| scene.instantiate | false | normal | network.local, filesystem.project, editor.modify | editor | Instantiate a scene as a child of a node in the edited scene with Undo/Redo support. |
| scene.open | false | normal | network.local, filesystem.project, editor.modify | editor | Open a scene file in the Godot editor. |
| scene.reload | false | risky | network.local, filesystem.project, editor.modify | editor | Reload a scene from disk in the editor. |
| scene.save | false | normal | network.local, filesystem.project, editor.modify | editor | Save the currently edited scene. |
| scene.save_as | false | risky | network.local, filesystem.project, editor.modify | editor | Save the currently edited scene to a new path. |
| script.attach | false | normal | network.local, filesystem.project, editor.modify | editor | Attach a script to a node in the edited scene with Undo/Redo support. |
| script.create | false | normal | network.local, filesystem.project, editor.modify | editor | Create a new script file with an optional template. |
| script.detach | false | normal | network.local, filesystem.project, editor.modify | editor | Detach a script from a node in the edited scene with Undo/Redo support. |
| script.inspect | true | normal | network.local, filesystem.project | editor | Inspect structure of a script (methods, properties, signals, base type). |
| script.validate | true | normal | network.local, filesystem.project | editor | Validate GDScript syntax and compile checks without saving. |
| session.export | false | normal | filesystem.project | — | Retain a hashed metadata bundle. Logs, screenshots and raw snapshots require explicit inclusion; review private data before sharing. No files are deleted. |
| session.manifest | true | normal | — | — | Read the persistent manifest of the current session, including screenshots and visual checkpoints. |
| session.metrics | true | normal | filesystem.project | — | Read bounded per-tool latency/failure samples, queue state, Node memory, disconnects and observed session bytes. Quota warnings never delete evidence. |
| session.status | true | normal | — | — | Return the active Godot MCP session and editor/runtime connection state. |
| signal.connect | false | normal | network.local, filesystem.project, editor.modify | editor | Connect a signal from a source node to a target node method with Undo/Redo support. |
| signal.connections | true | normal | network.local, filesystem.project | editor | List active signal connections on a node. |
| signal.disconnect | false | normal | network.local, filesystem.project, editor.modify | editor | Disconnect a signal between two nodes with Undo/Redo support. |
| signal.list | true | normal | network.local, filesystem.project | editor | List all signals declared on a node and its script. |
| transaction.begin | false | normal | filesystem.project | — | transaction.begin: declared on-disk file recovery with retained snapshots. |
| transaction.commit | false | risky | filesystem.project | — | Publish and validate staged files; failed validation triggers exact-byte compensation. |
| transaction.delete_file | false | normal | filesystem.project | — | transaction.delete_file: declared on-disk file recovery with retained snapshots. |
| transaction.diff | true | normal | filesystem.project | — | transaction.diff: declared on-disk file recovery with retained snapshots. |
| transaction.preview | true | normal | filesystem.project | — | transaction.preview: declared on-disk file recovery with retained snapshots. |
| transaction.recover | false | risky | filesystem.project | — | transaction.recover: declared on-disk file recovery with retained snapshots. |
| transaction.rollback | false | normal | filesystem.project | — | transaction.rollback: declared on-disk file recovery with retained snapshots. |
| transaction.status | true | normal | — | — | transaction.status: declared on-disk file recovery with retained snapshots. |
| transaction.write_file | false | normal | filesystem.project | — | transaction.write_file: declared on-disk file recovery with retained snapshots. |
| visual.capture_game | false | normal | network.local, filesystem.project | editor, runtime | Capture the running game viewport to a persistent PNG; requires an owned graphical runtime. |
| visual.capture_viewport_2d | false | normal | network.local, filesystem.project | editor, viewport2d | Activate the 2D editor tab and capture its viewport as a persistent PNG. Requires a graphical editor. |
| visual.capture_viewport_3d | false | normal | network.local, filesystem.project | editor, viewport3d | Activate the 3D editor tab and capture the requested visible viewport (0-3) as a persistent PNG. |
| visual.compare | false | normal | filesystem.project | — | Compare two retained screenshots pixel-for-pixel and retain a deterministic difference PNG/report. Requires identical dimensions. |
