# Codex connections and installation hardening

The local audit reproduced `Project is held by server` followed by `Connection closed` when Codex tool discovery and another client targeted the same project. This was a real gap in the earlier coverage: two different projects had been tested concurrently, but multiple clients of the same project had not.

The launcher now connects to one project owner through an authenticated local pipe. Each client gets its own MCP instance and approval codec, while bridge, runtime, policy and recovery services are shared. Addon maintenance still excludes server startup. Disconnected mutations are never automatically replayed.

Five regression cases cover sequential clients with different profiles, concurrent first clients, maintenance exclusion, invalid authentication/session greetings and incompatible owner versions. Two tests failed before the change. Windows EOF regressions then exposed teardown completing after the launcher exited; an internal disconnect notification now waits for owner cleanup. Existing descriptor and session `endedAt` checks passed after this fix.

## Local evidence

| Area | Result |
| --- | --- |
| Unit tests | 491 passed: protocol 56, server 338, CLI 97 |
| MCP catalog | At least one successful native call for each of 194 tools |
| Contracts and profiles | 1,697 checks; all eight profiles; zero failed checks |
| Codex selection | 48 isolated Git/non-Git, trust, root/subfolder and marker cases |
| Native Godot | 28 general cases, 15 runtime/recovery cases, two advanced debugger cases and two graphical capture cases |
| Native Codex client | Desktop binary 0.162.0-alpha.17.2 returned 194 tools through `mcpServerStatus/list` while the first SDK client stayed connected to the same session |
| Personal project readiness | Two clients using the effective project-local launcher shared the BLACKOUT session; closing the first left the second connected. Godot 4.6.3 and addon 0.6.2 connected during this development check, and `project.info` succeeded |
| Packaging | Self-contained archive installed and initialized successfully |

The tested development runtime was Windows, Node 24.21.0 and Godot 4.6.3. Remote release checks additionally cover the exact release commit on Node 22 and 24. Local engine logs retain deliberate negative fixtures, navigation warnings and dummy-renderer thumbnail errors; a passing suite is not a claim of zero engine log errors. One successful call per tool does not establish coverage of every argument combination. No personal game was used for destructive fixtures or executed by the audit.

Doctor also accepts a verified direct source launcher for readiness while retaining the separate upgrade consent requirement for replacing it. CLI/server entry paths are canonicalized, CRLF fields migrate safely, all bundled addon files are compared by hash, and stale descriptor owners are checked before contacting an old port.

## Direct publication to main

The release workflow runs the existing Windows validation on pushes to `release/**`, as well as `main`. This provides eligible Node 22 and 24 checks on the exact commit before a direct protected-branch push. Manual `workflow_dispatch` checks passed on the same commit but did not satisfy GitHub's protected update requirement. The jobs, test commands and branch protections remain unchanged; no pull request is needed for this publication flow.
