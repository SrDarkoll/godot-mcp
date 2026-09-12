# Plan 3 validation — 2026-09-05

Implementation remains uncommitted on `feat/foundation-editor-handshake`, based on `7e0b327`. No push, merge, user-project mutation or automatic screenshot deletion was performed.

## Verified results

| Check | Result |
|---|---|
| `npm run build` | Passed (also run by `npm test` and typecheck) |
| `npm run typecheck` | Passed for all three TypeScript packages |
| `npm test` | 98 passed: protocol 15, server 80, CLI 3 |
| `npm run test:integration` with mandatory Godot | 5 passed across 4 files |
| `npm run test:integration:visual` | 2 passed with Windows graphical Godot |
| `npm run check:godot` | All 17 addon scripts passed `--headless --check-only` |
| Visual inspection | 2D colored polygons/noise and 3D cube/plane visible; red-to-blue edit verified |

Target: Godot 4.6.3 stable, Windows, OpenGL Compatibility on AMD Radeon graphics. Final inspected PNG dimensions: 1060 × 868. Runtime/game capture, transaction rollback, automatic capture triggers and broader engine/renderer compatibility are not part of this milestone.

## Evidence

Persistent local evidence under the ignored `.godot-mcp/visual-test-runs/` directory includes:

- `graphical-bndnfM/evidence.json`: screenshot paths, manifest path and decoded pixel counts; all three PNGs were visually inspected.
- `graphical-bndnfM/.godot-mcp/sessions/2026-09-05T16-58-48-665Z_245c90e8/`: initial/changed 2D PNGs and 3D PNG, persisted manifest and visual checkpoints.
- `syntax-T1MkUS/syntax-results.json`: individual Godot import/check-only exit codes and output for all 17 scripts.
- Further regression runs are retained alongside these directories; none replaces/deletes earlier evidence.

The noisy fixture verifies PNG delivery beyond 64 KiB. MCP image bytes were compared with the on-disk PNG and SHA-256. Godot decoded the files and counted known colors: initial 2D red 14214 pixels; changed 2D red 10 and blue 14212 pixels. The 3D image contained 40032 red and 457656 green pixels. The same editor reconnected after server restart and created a new session with screenshot sequence 1, preserving the prior session.

## Error and regression coverage

Tests cover strict input validation, malformed PNG/base64/CRC/dimensions, safe generated paths, junction rejection, collision-safe names, concurrent saves, retained PNGs on manifest failure, recoverable write queues, checkpoint references, missing editor/capabilities/scene, hidden 3D viewport, headless rejection, graceful session closure and authenticated readiness.

The first graphical test exposed a no-frame timeout in an occluded editor. Native `force_draw(false)` fixed it; no desktop capture fallback was used. The restart test exposed a stale connection attempt to the previous port. Descriptor-change detection and a connect deadline fixed it. Readiness tests also caught RPC access before version metadata publication and now require `EDITOR_NOT_CONNECTED` until ready.

The existing mutation integration intentionally validates invalid GDScript and therefore emits a parse diagnostic from that test input. Godot's dummy renderer also emits `Parameter "t" is null` when that suite saves a scene thumbnail in headless mode. The assertions pass; these outputs are not presented as a clean engine log. The separate addon syntax checks and graphical capture tests have no GDScript parse errors. Neither a build nor these tests establish production readiness for the full project.

The suite is task-directed, not exhaustive: hostile concurrent filesystem replacement, all Godot 4.x versions and every GPU driver are outside the verified matrix. The server validates PNG structure and CRC; it does not implement a second pixel decoder. Images are decoded using Godot in integration.
