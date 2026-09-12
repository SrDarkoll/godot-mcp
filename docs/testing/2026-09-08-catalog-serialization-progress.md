# Catalog, serialization and delivery docs — 2026-09-08

Completed in this block:

- R1: one typed policy catalog covering all 94 registered tools, unknown-tool rejection, duplicate-registration rejection, baseline permissions/risk/capability metadata and connected-addon capability checks. Input schemas remain defined at registration and are exported from that actual registration, avoiding a separate hand-maintained schema copy. A full equality test covers all pages of tools/list. `npm run docs:tools` generates Markdown/JSON; `check:catalog` detects stale output and is included in CI.
- R2: bounded native Variant serialization and runtime checks, cycle detection, conservative byte/item/depth limits, pre-mutation argument rejection, propagation of nested conversion failures, and bounded scene/filesystem traversal.
- A6: replaced the obsolete foundation README, updated all package READMEs, and added installation, compatibility, release, contribution, security and changelog documents. They distinguish implemented features, verified targets, pending enhancements, unpublished artifacts and remote CI not yet run.

Observed verification:

| Check | Result |
|---|---|
| npm test | 152 passed: protocol 20, server 118, CLI 14 |
| npm run typecheck | Passed |
| check:catalog | 94 tools match live schemas and generated docs |
| Integration base | 15 passed before final traversal extension; affected serialization/editor mutation cases passed again afterward |
| Graphical runtime | 7 passed after Variant/runtime changes |
| Graphical captures | 2 passed |
| check:godot | 24 addon scripts + generated Logger passed; later affected native files compiled/executed by focused integration |
| Distribution consumer | Passed outside checkout with the consolidated package READMEs |

Evidence includes `.godot-mcp/visual-test-runs/syntax-tkc2fK` and retained serialization fixtures. Distribution artifact path for the documented consumer run: `.godot-mcp/distribution/0.1.0-887c75c9`; consumer `C:\Users\ramir\AppData\Local\Temp\godot-mcp-consumer-61ppLT`. This package snapshot predates the final filesystem traversal guard; final goal verification must package the final tree again.

The filesystem traversal test initially exposed a fixture/native type mismatch, which was corrected before asserting the actual missing depth/entry guards. Those assertions then failed for the intended reason and passed after implementation. No ignored failure is treated as success.

Remaining full scope: R3–R5, N1–N6 and final requirement-by-requirement verification. The objective is not complete. No staging, commits, pushes, release tags or publication were performed.
