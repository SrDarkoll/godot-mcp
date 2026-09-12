# Audit remediation — verified progress, 2026-09-08

The complete objective remains active. This records a verified implementation block, not completion of the full audit roadmap.

## Implemented and verified

- A1: allowlisted native reflection by class, permanently blocked dispatch wrappers, scene-owned node targets, and explicit disabled-by-default script trust. Unit and native regressions failed before implementation. Live MCP/editor integration verifies denied script access, permission enable confirmation, confirmed custom method result 42, indirect-dispatch rejection and parent-scope rejection.
- A3: status/stop and independent doctor checks survive malformed JSON and invalid schemas. Explicit `config --repair` preserves original bytes, retains unknown object keys and rejects unsafe backup destinations.
- A4: CI installation uses a console executable and a process with explicit wait, captured stdout/stderr, exit-code validation and timeout. The complete download/hash/extract/version sequence passed locally in PowerShell 7, followed by native syntax and integration using that downloaded executable. Version mismatch and timeout tests pass. No remote GitHub Actions run is claimed.

## A2 in progress

Conditional file writes now check the expected hash on entry and immediately before publication, creation does not replace a newly appeared destination, compensation checks its recorded preconditions, and forced recovery refuses edits newer than its safety checkpoint. Four deterministic concurrency regressions failed first and now pass; all nine recovery unit tests pass.

This is still optimistic concurrency. The final check and replacement of an existing file are not an OS compare-and-swap. **A2 stays open:** shared exclusion across cooperating server/CLI processes, additional crash-transition tests and final isolation documentation remain. A5 must use the same maintenance boundary and provide recovery from partial addon updates.

## Fresh verification

| Command | Result |
|---|---|
| npm test | 135 passed: protocol 20, server 107, CLI 8 |
| npm run typecheck | Passed after production changes |
| npm run test:integration | 12 passed, using freshly installed console Godot |
| npm run check:godot | 23 addon scripts + generated Logger passed |
| npm run test:distribution | Passed; packages installed outside checkout |

Evidence: `.godot-mcp/distribution/ci-engine-2026-09-08`, `.godot-mcp/visual-test-runs/syntax-u635uU`, `.godot-mcp/distribution/0.1.0-15cc54cc`. External package consumer: `C:\Users\ramir\AppData\Local\Temp\godot-mcp-consumer-e3V1Q9`.

Visual/runtime graphical suites were not repeated in this block; previous results are not substituted for the final complete regression. Known intentional parser-error diagnostics and dummy-renderer thumbnail messages still occur in editor mutation tests without assertion failures.

## Remaining full scope

A2/A5, consolidated delivery documentation A6, all five broad reinforcements R1–R5 and six additions N1–N6 remain tracked in `docs/superpowers/plans/2026-09-07-audit-remediation.md`. No branch, commit, staging, push or publication was performed.
