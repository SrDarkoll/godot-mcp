# Headless validation and transaction diff — 2026-09-08

N1 and N2 are implemented. The full objective remains active.

## Headless validation

`project.validate` snapshots bounded project input, imports the copy with its MCP bridge disabled, and validates supported files in a separate Godot worker. It does not require an editor connection. Reports retain file results, diagnostics, scope/completion, hashes, logs and artifact paths. Incomplete runs carry a tool error flag; an invalid but fully evaluated source returns a complete negative report.

Real Godot integration covers global-class resolution, valid scenes/scripts, invalid GDScript, an import plugin that blocks until the process timeout, and an import plugin that modifies a validation target. Original source remains unchanged in those fixtures. Unit coverage checks metadata exclusion, links, byte limits and source changes during capture.

The outside-checkout consumer exposed a method-name collision: a project script's own `reload` method interfered with an untyped call to native GDScript.reload. The validator and native recovery handler now use a statically typed GDScript binding. A regression with a user `reload` method failed first and now passes; the installed addon is also validated successfully by the package consumer.

The CLI/server share one bounded process runner. It waits for child closure after failure rather than rejecting immediately after requesting termination. Existing noisy/hung command tests continue to pass.

## Diffs

`transaction.diff` reads verified snapshot blobs, classifies creation/deletion/binary/text changes and emits a bounded unified preview. Newline/BOM metadata exposes changes that normalized lines alone would hide. Common credentials are masked by default, including snake_case key names; raw output requires explicit `redact: false`. Redaction remains heuristic.

Regressions cover no publication, text replacements, binary deletion, new-file hunk coordinates, global output budgets, explicit raw mode and encoding-only changes. The installed package consumer exercises diff and rollback without publishing the staged file.

## Verification observed

| Check | Result |
|---|---|
| npm test | 162 passed: protocol 20, server 128, CLI 14 |
| npm run typecheck | Passed |
| Base integration | 17 passed before the final reload regression; affected headless/recovery cases passed again afterward |
| Headless + native recovery focused integration | 2 passed after the reload correction |
| Catalog | 98 tools generated/verified |
| Independent distribution | Passed with headless validation and transaction diff enabled |

Distribution evidence: `.godot-mcp/distribution/0.1.0-809d13cd`; consumer: `C:\Users\ramir\AppData\Local\Temp\godot-mcp-consumer-ThDOsD`. Its report explicitly lists headless project validation, transaction diff without publication, metrics, export and authenticated CLI lifecycle checks. The later credential-pattern adjustment was verified by focused and full unit tests; final goal closure must package the final tree again.

No graphical runtime/capture changes are claimed in this block. Limits and trust boundaries are documented in `docs/tools/headless-validation.md` and `docs/tools/transaction-diff.md`. R5, N3–N6 and full closure remain pending. No staging, commits, pushes or publication were performed.
