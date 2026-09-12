# Reflection and trusted script methods

`object.call` accepts only an explicit set of native methods, checked against the target's Godot class. Indirect dispatch (`call`, `callv`, deferred calls, RPC, signal emission and notification dispatch) remains forbidden even with confirmation and script trust.

Native reflection currently supports identity/type queries on Object, basic identity/tree-state queries on Node, contact queries on CharacterBody2D/3D, dimensions on Texture2D and duration on AudioStream. Other native operations should use structured tools. An unknown native method is denied rather than automatically becoming confirmable.

Node targets must belong to the currently edited scene. Parent traversal and foreign instance IDs are rejected. Resource targets must identify project resources, excluding MCP internals. These controls scope tool access; they do not sandbox code already present in the project.

Custom script methods, including script overrides of an allowlisted name, require:

1. Enable the session permission `editor.script_methods`. It defaults to false and enabling it requires confirmation.
2. Send `trusted_script: true` in the `object.call` request.
3. Confirm that exact operation using its single-use confirmation token.

Script trust does not enable unlisted native methods or the prohibited dispatch methods. Trusted scripts can themselves perform arbitrary Godot actions, including file/network/process access; the permission is an explicit trust decision, not an OS sandbox. Project code may also run through normal editor/runtime operations.

Regression coverage: `tool-policy.test.ts`, `reflection-safety.test.ts` (real headless Godot), and `editor-mutation.test.ts` (MCP permission/confirmation through the live editor).
