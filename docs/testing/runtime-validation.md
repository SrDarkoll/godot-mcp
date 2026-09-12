# Runtime and debugger validation — 2026-09-05

Plan 4 was implemented over the uncommitted Plan 3 changes on `feat/foundation-editor-handshake`, based on `7e0b327`. No commit, push, merge, screenshot cleanup or personal-project edits were performed.

## Results

| Check | Verified result |
|---|---|
| `npm test` | 107 passed: protocol 18, server 86, CLI 3 |
| `npm run typecheck` | Passed for all three TypeScript packages; includes build |
| `npm run test:integration` | 7 passed across 6 files |
| `npm run test:integration:visual` | 2 passed; editor captures preserved |
| `npm run test:integration:runtime` | 7 passed across 2 files, with real editor/game processes |
| `npm run check:godot` | 22 addon scripts plus generated Logger passed check-only |
| Native feasibility probe | 64 KiB echo, output/warning/error and a threaded log; debugger session stopped |
| Game PNG | Decoded with Godot and visually inspected; bytes and SHA-256 match MCP output |

Verified engine: Godot 4.6.3 stable on Windows, OpenGL Compatibility. The game was embedded by the editor and produced a 514 × 386 viewport; nominal project size was 640 × 480. Tests compare the independently decoded dimensions with captured metadata instead of assuming the nominal size.

The retained game image contains 32546 blue pixels. The source scene's polygon is red; the game changes it to blue at runtime. A deterministic noisy texture makes the PNG exceed 64 KiB and exercise multiple native debugger fragments. Capturing while SceneTree is paused also passed.

## Retained evidence

Repository-relative locations, intentionally ignored by Git:

- `.godot-mcp/runtime-test-runs/probe-alyYak/probe-result.json` and `probe-output.log`: native debugger/Logger feasibility results.
- `.godot-mcp/runtime-test-runs/runtime-TqeSDS/capture-evidence.json`: latest full-suite capture path and decoded pixel statistics.
- `.godot-mcp/runtime-test-runs/runtime-TqeSDS/.godot-mcp/sessions/2026-09-05T18-08-49-869Z_e228b8d3/screenshots/game/0001_live_game.png`: actual game capture.
- `.godot-mcp/visual-test-runs/syntax-9RpvPL/syntax-results.json`: per-script check-only output, including generated Logger.
- Each runtime fixture retains `import.log`, `engine.log`, session manifest, run history, diagnostic JSONL and any screenshots. Earlier failed experiments remain available beside successful runs.

## Covered behavior

- Principal launch resolves both a normal scene path and a Godot `uid://` reference; alternate-scene launch and restart get distinct run IDs.
- Runtime tree excludes the MCP autoload; Vector2 properties use canonical serialization. SceneTree pause freezes a counter while inspection stays available.
- Native output, warning and error records appear in filtered queries and persistent JSONL. Pagination advances across filtered entries and duplicate batches are not persisted twice.
- Bounded history reports dropped data; simulated log-disk failure retains readable in-memory output and marks persistence degraded. A failed manifest publication no longer returns a falsely durable launch result.
- Stop is idempotent, uses a control lane and cancels a deliberately delayed in-progress game capture within the test's three-second stop bound, without recording a screenshot success.
- A manually launched game is not stopped or replaced by MCP. A manual game after an owned run also remains external; a regression initially caught ownership inheritance and now passes.
- A real debugger break reports `breaked`, rejects runtime inspection with `RUNTIME_BREAKED`, and still allows stop.
- Closing MCP stdin stops its owned game and records runtime/session end timestamps.
- Installation is idempotent, checks an autoload name collision before altering settings and generates the Logger adapter. Fragment assembly rejects invalid order, missing pieces, oversize headers and checksum corruption in real GDScript.
- Final process inventory contained only the pre-existing personal Godot editor; fixture processes were closed.

## Limits and diagnostics

This is task-directed validation, not a complete engine/GPU/version matrix. Other Godot 4.x versions and exported standalone debug builds were not exercised as compatibility targets. The runtime agent's standalone guard is present; this report does not claim an export/release validation suite.

Diagnostic delivery is best effort after Logger installation. Errors before installation and final queued messages lost on abrupt termination cannot be recovered. `diagnosticsComplete` intentionally stays false. Origin metadata is included; interactive breakpoint editing, stepping, captured variables and full debugger stack inspection are deferred. JSONL is capped at 10 MiB per run without deleting earlier data; there is no replay/recovery system for truncated streams.

The pre-existing mutation suite intentionally validates broken GDScript and emits that parse diagnostic. Godot's headless dummy renderer also reports a null thumbnail texture during that suite's scene save. Its assertions pass; this is not described as a pristine engine log. The dedicated addon syntax and graphical runtime tests contain no addon parse failures. The runtime fixture deliberately prints/pushes its output, warning and error markers.

The work remains pre-alpha and does not establish production readiness for the full specification. Transactions, rollback, runtime property mutation, runtime without an editor and automatic visual triggers remain future milestones.
