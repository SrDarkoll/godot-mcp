# Godot MCP Audit Remediation Implementation Plan

> **Execution:** Implement inline on `feat/mcp-audit-fixes-2026-09-24`, preserving `main` and the published `v0.4.0` tag until all gates pass.

**Goal:** Resolve audit findings A1–A9 from `docs/testing/2026-09-24-mcp-audit.md` with verified behavior, accurate documentation, and a release on top of `main`.

**Architecture:** Keep the existing MCP stdio server, typed tool contracts, guarded tool registration, authenticated loopback bridge and Godot addon. Add one bounded, read-only geometry query; extend capture metadata and transient runtime framing; isolate event subscriptions from the global operation gate; and make lease contention diagnosable without weakening mutual exclusion.

**Tech Stack:** TypeScript, Zod, Vitest, Godot 4.6.3/GDScript, Node 22/24, Windows CI.

---

## Task 1: Event subscriptions do not block edits or shutdown (A2)

**Files:** `packages/server/src/security/tool-policy.ts`, `packages/server/src/events/project-events.ts`, `packages/server/src/index.ts`, `packages/server/test/tool-policy.test.ts`, `packages/server/test/project-events.test.ts`.

- [x] Add a test that opens `project.events` long-poll, starts a scene mutation and proves the mutation and resulting event complete before the long-poll timeout.
- [x] Route `project.events` through assessment and permission checks without holding the shared `OperationGate` during the wait.
- [x] Allow policy shutdown to finish while subscriptions are pending; `bridge.stop()` wakes them, and test the order.
- [x] Run focused policy/event tests, then the server suite (285 passing).

## Task 2: Diagnose `PROJECT_BUSY` without guessing the owner (A5)

**Files:** `packages/server/src/project/project-lease.ts`, `packages/cli/src/init/init-project.ts`, `packages/server/test/project-lease.test.ts`, `packages/cli/test/init-project.test.ts`, new `docs/tools/project-maintenance.md`.

- [ ] Reproduce contention between a running server and an addon update, plus contention between two short maintenance operations.
- [ ] Return bounded lease metadata: operation, acquisition time and process identity where available; distinguish `EACCES` from an occupied lease.
- [ ] Surface authenticated server status before retrying; retry only short maintenance contention with a fixed deadline, never a known live server.
- [ ] Verify release after owner exit and crash; preserve unrelated project files and journals.

## Task 3: Explain native Variant mismatches (A6)

**Files:** `packages/godot-addon/addons/godot_mcp/bridge/handlers/batch_handlers.gd`, `tests/integration/scene-batch.test.ts`, `docs/tools/structured-batches.md`.

- [ ] Add a Polygon2D/Line2D case where plain points fail with expected type, received type and a valid encoded example.
- [ ] Keep the existing typed `PackedVector2Array` conversion working and verify Undo/Redo.
- [ ] Run the native scene-batch integration test.

## Task 4: Resolve retained captures after reconnect (A7)

**Files:** `packages/protocol/src/session-artifacts.ts`, `packages/server/src/visual/screenshot-store.ts`, `packages/server/src/visual/capture-resolver.ts`, `packages/server/src/mcp/register-visual-tools.ts`, `scripts/tool-contracts.json`, `packages/server/test/visual-tools.test.ts`, `tests/integration/visual-capture.test.ts`.

- [ ] Add an absolute path and one opaque, self-contained capture reference to new capture results while retaining the existing fields.
- [ ] Add a read-only resolver that validates the reference, session manifest, ordinary file and hash before returning metadata/path.
- [ ] Verify resolution after closing the original session and starting a new one; reject malformed and cross-project references.
- [ ] Regenerate and verify tool contracts and profile counts.

## Task 5: Capture a sector without saving a camera change (A8)

**Files:** `packages/protocol/src/visual.ts`, `packages/server/src/tools/visual-tools.ts`, `packages/godot-addon/addons/godot_mcp/runtime/runtime_capture.gd`, `packages/godot-addon/addons/godot_mcp/runtime/runtime_handlers.gd`, `tests/integration/runtime-game-capture.test.ts`, `docs/tools/visual-capture.md`.

- [ ] Extend game capture with optional finite `center {x,y}` and positive `zoom {x,y}`; keep existing calls unchanged.
- [ ] In the owned runtime, apply a temporary Camera2D for the capture, restore the prior camera in all completion/error paths, and leave scene files untouched.
- [ ] Include the actual framing in returned metadata and test both successful capture and restoration after failure.
- [ ] Run graphical runtime integration and inspect the retained capture evidence.

## Task 6: Read-only geometric route validation (A1)

**Files:** `packages/protocol/src/geometry.ts`, `packages/godot-addon/addons/godot_mcp/bridge/handlers/geometry_handlers.gd`, `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`, `packages/server/src/mcp/register-geometry-tools.ts`, `packages/server/src/mcp/create-server.ts`, `scripts/tool-contracts.json`, `tests/integration/geometry-validation.test.ts`, `docs/tools/geometry-validation.md`.

- [ ] Define a bounded read-only input for Line2D centerline/width or Polygon2D route footprints, explicit CollisionShape2D/CollisionPolygon2D obstacles, agent clearance and endpoint links/tolerance.
- [ ] Convert all points and supported primitive collision shapes into scene-global coordinates. Report unsupported/disabled/hollow shapes explicitly instead of silently treating them as clear.
- [ ] Compare full corridor footprints against obstacles using `Geometry2D`, and measure declared endpoint gaps without mutating the scene.
- [ ] Return structured node paths, coordinates, overlap/gap measurements, `complete`, truncation and diagnostics. Bound routes, obstacles, points, intersections and response bytes.
- [ ] Verify an intersection like the reported `CentralCross` case fails and a corrected route passes, including rotated/scaled transforms, clear routes, touching boundaries, unsupported shapes and no-save invariants.
- [ ] Regenerate contracts, run real Godot integration and verify the new tool is available in appropriate profiles.

## Task 7: Correct public guarantees and compatibility (A3/A4)

**Files:** `README.md`, `packages/cli/README.md`, `docs/tools/transactions-recovery.md`, `docs/architecture/compatibility-capabilities.md`, new `docs/releases/0.5.0.md`.

- [ ] Replace multi-file atomicity/zero-partial-write promises with journalled, recoverable publication and its external-writer limit.
- [ ] State Windows as the supported runtime while the project lease rejects Linux/macOS; remove unverified cross-platform claims.
- [ ] Document the new geometry, capture and contention behavior without claiming coverage beyond tested Godot versions.
- [ ] Run documentation links and package README checks.

## Task 8: Gate capture/runtime changes before release (A9)

**Files:** `.github/workflows/ci.yml`, `.github/workflows/graphical.yml`, `scripts/run-integration.mjs`, `docs/releases/0.5.0.md`.

- [ ] Make geometry validation part of normal Windows integration.
- [ ] Define an actionable release gate for visual/runtime changes using a verified graphical runner or an equivalent deterministic test path; fail visibly if required evidence is absent.
- [ ] Preserve artifact exclusions for runtime tokens and local project config.
- [ ] Verify the workflow syntax and run the remotely available jobs.

## Task 9: Final verification and delivery

- [ ] `npm ci`, `npm test`, `npm run typecheck`, `npm run check:tool-contracts`, `npm run check:docs`, `npm run check:godot`, `npm run test:integration`, visual/runtime suites, package dry run and consumer install.
- [ ] Verify Node 22 and 24, release manifest file allowlist, secret scan, `git diff --check`, no residual Godot processes and clean tracked tree.
- [ ] Commit cohesive changes, push, review remote CI, merge to `main`, tag a new version and publish the exact reviewed tarball to npm and GitHub Release under the user’s standing authorization.
