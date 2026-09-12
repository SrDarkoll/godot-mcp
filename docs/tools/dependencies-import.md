# Dependencies, impact and import

`resource.dependencies` uses Godot's imported resource metadata to return bounded direct or transitive edges, UID/fallback paths and missing dependencies. Recursive queries limit depth to 32 and nodes to 1,000; `complete: false` means the graph is partial.

The implementation follows Godot's [`ResourceLoader.get_dependencies`](https://docs.godotengine.org/en/4.6/classes/class_resourceloader.html#class-resourceloader-method-get-dependencies) format and resolves UID entries through [`ResourceUID`](https://docs.godotengine.org/en/4.6/classes/class_resourceuid.html).

`resource.impact` scans up to 5,000 project files for inbound references before a proposed move or delete. It reports target conflicts, skipped links, truncation and `safe`. It does not mutate resources. Do not proceed when the preflight is incomplete or unsafe. UID references often survive moves, while fallback paths and arbitrary strings may require explicit updates; custom loaders can add behavior beyond this scan.

`editor.import_resources` waits for the editor filesystem and synchronously reimports 1–64 declared files. It requires confirmation because importers and project plugins are trusted code. The result includes requested paths, types, import validity, duration and completion. Filesystem events are available through `project.events`.

Godot documents `EditorFileSystem.reimport_files` as blocking until import finishes and warns against starting another scan while an import is in progress; this tool waits for scanning to become idle first. See the [EditorFileSystem API](https://docs.godotengine.org/en/4.6/classes/class_editorfilesystem.html).

Dependency results reflect the connected editor's import database. Links and MCP metadata are skipped during impact scanning. Use `project.validate` for retained-copy validation; active import updates the current editor's `.godot` cache.
