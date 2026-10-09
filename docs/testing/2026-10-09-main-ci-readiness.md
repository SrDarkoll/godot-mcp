# Main CI readiness failures, 2026-10-09

The pull-request checks for 0.6.2 passed, but the subsequent `main` push run `37969620787` failed two independent integration assertions on the same source tree.

- Node 24 failed `scene-batch.test.ts:32`: the test expected `scene.changed` in the first long-poll response. `project.events` correctly wakes on any new event, and initial scene restoration can occur before the plugin subscribes.
- Node 22 failed the first workflow test while the runtime harness waited for a scene tree. The editor connection had succeeded; the helper relied on the positional CLI scene being restored and did not explicitly select its fixture.

The scene-batch fixture now opens a separate probe scene and returns to `main.tscn` after taking its event cursor. It advances that cursor across intervening pages and waits for `scene.changed` with the expected path, while still rejecting history gaps. This verifies a real scene transition rather than depending on startup signal order.

The runtime harness now opens `main.tscn` through MCP after the editor connects. A regression fixture removes the startup main-scene setting and omits the CLI scene argument. Before the fix it reproduced the scene-tree readiness timeout; after the fix it opens the expected scene and passes. Readiness failures now retain their phase, process state and bounded engine-log tail in the error output as well as local evidence files.

Local validation: the scene-batch case passed five consecutive fresh fixtures; all 13 runtime cases passed, including ownership, pause, debugger break, capture, stop and workflow checks. No assertions were removed, no checks were disabled, and no readiness timeout was increased.

The changes are confined to integration fixtures and diagnostics. Product code, package versions, the published 0.6.2 archive and release tags are unchanged. Remote validation must cover both the pull request and a fresh `main` push; a green pull request alone is not reported as a green main commit.

The code graph refresh was unavailable (`Transport closed`). Investigation used the failed job logs, exact source reads and executable Godot reproduction. Retained GitHub artifact downloads also timed out at their storage endpoint; the local reproduction and improved failure output avoid relying on unavailable downloads.
