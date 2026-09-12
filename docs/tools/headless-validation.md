# Headless project validation

`project.validate` validates a retained project copy without requiring an editor connection. Configure the trusted Godot executable through `godot-mcp config <project> --godot <executable>` or the server host's GODOT_BIN environment. The tool does not accept an arbitrary executable from MCP arguments.

The pipeline captures project files, disables the MCP editor bridge in the copy, runs headless editor import, then compiles/loads requested GDScript/scenes/resources and parses JSON with a separate worker. Global script classes are registered by the import phase. The worker statically binds GDScript.reload so user methods with that name do not interfere.

Default validation targets are copied `.gd`, `.tscn`, `.tres` and `.json` files. `paths` selects explicit files, but project import diagnostics still affect the result. Unsupported code/resource types such as C#, GPU shaders and GDExtensions are reported as unvalidated instead of receiving a complete validity claim. This is not a playthrough, GPU shader compilation or production-readiness check.

The result distinguishes:

- `valid`: the captured validation scope passed without errors or missing coverage.
- `complete`: the requested checks finished; invalid source can have `complete: true, valid: false`.
- Incomplete validation: timeout, output/copy limits, unsupported types, missing reports or modified snapshot targets produce `complete: false` and a tool error flag while retaining the structured report.

The artifact directory contains the copied project, snapshot file hashes, original project settings, staged settings hash, request, worker script, bounded phase logs and report.json. Existing source files are not written by the validator. Project plugins and tool scripts remain trusted native code and are **not sandboxed**; they can have arbitrary OS effects. Results apply to the recorded copy, not source edits made after capture. Target changes made by import/project code inside the copy are detected and invalidate completion.

Limits: 1–120 seconds for the shared validation deadline; 256 MiB default copied project budget (maximum 1 GiB); 64 MiB per input file; 4,096 copied files / 10,000 visited entries; at most 512 validation targets; 2 MiB per phase output; at most 200 returned diagnostics. Limits yield explicit incomplete results rather than a partial success. Use a client request timeout long enough for the selected validation deadline plus reporting overhead.

Git, Godot cache, MCP state, agent metadata, common IDE metadata and node_modules are excluded from the copy. Links are refused. Ordinary source edits during capture are detected from file metadata. This is not an atomic snapshot against non-cooperating external writers. Source files in copied directories are eligible for explicit checks even when Godot's importer ignores that directory.

Validation is serialized with project writers and refuses an active file transaction or unresolved project recovery journal. Captured source and logs are private evidence: they are retained, not automatically purged or implicitly approved for sharing. They are not included by the default metadata-only session export.
