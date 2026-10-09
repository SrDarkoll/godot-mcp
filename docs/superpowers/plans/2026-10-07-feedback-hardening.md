# Godot MCP feedback corrections

**Goal:** Review MCP-01 through MCP-06 against the current source, correct reproducible gaps, and record the verification limits.

**Approach:** Execute in this session with isolated Godot fixtures and focused Node tests. Preserve the Campus project. Keep existing permission and runtime ownership rules. Use explicit test contracts, not console-word heuristics.

- [x] MCP-01: Capture Godot's native compiler diagnostics around `GDScript.reload()`. Verify syntax, Variant inference and dependency errors, corrected code, real line numbers and unknown columns.
  Files: `serialization/native_diagnostics.gd`, `bridge/handlers/script_handlers.gd`, `packages/protocol/src/tools.ts`, `tests/fixtures/feedback_native_test.gd`.
- [x] MCP-03: Add snapshot-bound cursors and byte-bounded pages to `tilemap.get_cells`. Keep explicit coordinate queries and direct counting through `tilemap.inspect`.
  Files: `bridge/handlers/tilemap_handlers.gd`, `packages/server/src/mcp/register-tilemap-tools.ts`, `packages/server/src/tools/tilemap-tools.ts`, `packages/protocol/src/tilemap.ts`.
  Verify all 1,907 coordinates without duplicates or omissions, empty and coordinate-filtered pages, changed maps and invalid cursors.
- [x] MCP-05: Validate property metadata and safe conversions before recording Undo. Reject missing properties, wrong Resource subclasses and failed resource loads; read back the effective value and identify unsaved changes.
  Files: `serialization/property_value.gd`, `bridge/handlers/node_handlers.gd`, `tests/fixtures/feedback_native_test.gd`.
- [x] MCP-04: Record request IDs and whether a request was sent. A lost response remains unknown and is never replayed automatically. Verify writes of 128, 512, 1,285 and 1,907 cells over MCP and record any guard rejection. Align native input and WebSocket capacity while preserving strict decoded-value budgets; reject oversized encoded frames before sending.
  Files: `packages/server/src/bridge/rpc-router.ts`, `bridge-server.ts`, `packages/server/test/rpc-outcomes.test.ts`, `bridge/rpc_dispatcher.gd`, `bridge/bridge_client.gd`, native and MCP fixtures.
- [x] MCP-02: Capture compiler failures before launch and preserve a session-owned boot log for failed starts. Retained diagnostics must remain readable after readiness fails; describe observed process state and unavailable exit codes honestly.
  Files: `debugger/editor_debugger.gd`, `packages/server/src/runtime/runtime-service.ts`, `startup-diagnostics.ts`, runtime protocol and tests.
- [x] MCP-06: Separate runtime health, native diagnostics, configured project tests and visual review. Poll a declared runtime property with expected pass/fail values and a deadline. Preserve unconfigured tests as not checked; pending checks remain inconclusive.
  Files: `packages/protocol/src/workflow.ts`, `packages/server/src/workflow/workflow-service.ts`, workflow tests and runtime integration fixture.
- [x] Generate updated tool contracts, run TypeScript and Godot checks, then relevant unit and integration suites. Record the results in `docs/testing/2026-10-07-feedback-audit.md`.

Commands use `rtk`. Native tests use `GODOT_BIN=C:\Users\ramir\Desktop\Godot_v4.6.3-stable_win64.exe`. The initial compiler reproduction confirmed error 43, its original message, and line 5 through the native Logger callback. A controlled reproduction with the old input buffer confirmed close code 1009 at 1,285 cells; this does not prove the cause of the historical incident.
