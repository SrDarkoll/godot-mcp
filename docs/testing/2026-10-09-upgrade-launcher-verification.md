# Upgrade launcher verification, 2026-10-09

The reported 0.6.1 failure was reproduced with a read-only configuration preview. Codex launched `node.exe` with a local retry script as its first argument and the source workspace's server entry as its second argument. The old migrator rejected the script before inspecting the actual server; the direct source entry would also fail its public-bundle ownership check.

0.6.2 separates launch inspection from migration. It verifies the server entry and package manifests, recognizes the public npm bundle or the exact source workspace layout, and reports a local script as a launcher replacement candidate without executing it. Source/custom launchers require approval to switch to the pinned npm command. Unrelated identities, links, missing files, unknown forwarding arguments and different project targets remain rejected.

Completed checks on Windows with Node 24.21.0 and Godot 4.6.3.stable.official.7d41c59c4:

| Check | Result |
| --- | --- |
| Protocol unit suite | 56 passed |
| Server unit suite | 307 passed |
| CLI unit suite | 48 passed |
| General Godot integration | 28 passed across 20 files |
| Upgrade integration subset | 8 passed, including live wrapper migration, rollback, existing/absent config edits and post-shutdown lease failure |
| Addon compilation | 42 scripts plus generated logger passed |
| Workspace typecheck and tool contracts | Passed; 194 tool contracts current |
| Release-script suite | 16 passed |
| Public package metadata | Passed for 0.6.2 |
| External consumer | Installed the release tarball and passed preview, explicit wrapper migration consent, exact config backup, retained wrapper, setup, authenticated status and shutdown |

The source and wrapper regressions failed before the fix with the reported recipe error or an incorrect package-manifest lookup. The redirected-output regression initially skipped the question despite interactive input. They pass after correcting launch inspection and terminal detection.

A real terminal test used an isolated project with a wrapper that throws if executed during inspection. Declining preserved all five recorded installation-file hashes. Approving used one question, retained the wrapper and the exact configuration backup, preserved `required` and `startup_timeout_sec`, and completed doctor successfully. Live-session tests separately proved that preview and cancellation leave the session usable, and that a single confirmation can approve both replacement and authenticated shutdown.

The actual smoke project was inspected twice without migration. Its addon marker was 0.6.0 and its retry/source launcher was recognized. SHA-256 comparisons of the Codex configuration, wrapper, project settings, addon metadata and MCP settings were unchanged across each inspection. The later preview detected an active session and reported both approval requirements; that session was not stopped.

The integration fixtures use a legacy addon version marker to isolate migration behavior; this report does not claim a new migration test from every historical npm archive. Doctor verifies installation health, not game logic or visual quality. The general suite includes negative resource/encoding cases and headless-renderer output, so passing the suite is not a claim that every engine log line is error-free.

Initial structural discovery used the code graph and call traces. Its refresh became unavailable with `Transport closed`; final verification relied on current source reads, diffs and executable checks rather than claiming fresh or exhaustive graph coverage.
