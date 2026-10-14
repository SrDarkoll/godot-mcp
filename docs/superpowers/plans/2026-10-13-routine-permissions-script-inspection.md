# Routine permissions and fresh script inspection

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Execution stays in the existing `fix/routine-permissions-script-inspection` branch.

**Goal:** Remove redundant approval from bounded project operations, prevent scene-close data loss, and reproduce/fix stale script inspection without modifying BLACKOUT or GodotMcpSmoke.

**Architecture:** Keep session permissions, the audit log, operation gate, recovery barrier and signed risk approvals. Classify routine settings using a small allowlist with ordinary project-file validation. Default scene close saves first; explicit discard remains risky. Path-based inspection reads a fresh script without replacing the live attached instance.

**Tech Stack:** TypeScript, Zod, Vitest, Godot 4 GDScript, native headless fixture with Godot 4.6.3.

## 1. Reproduce before changing behavior

Files: `packages/server/test/routine-permissions.test.ts`, `tests/fixtures/routine_native_test.gd`, `tests/integration/routine-native.test.ts`.

- [x] Add registrar regressions asserting routine handlers execute with no `inputRequests`, while explicit discard and external permissions still elicit approval.
- [x] Cover name, main scene, normal autoloads/removal, viewport, stretch and texture filter settings; unknown keys, bad values, reserved autoloads, missing/external/linked resources remain guarded.
- [x] Add native tests caching an old script, changing its file, and checking new methods/properties/signals by path while the attached cached script remains unchanged. Invalid and deleted source cannot fall back to old metadata.
- [x] Add native scene-close tests for save-before-close, unnamed scene, failed save, absent scene and explicit discard.

Regression examples:

```ts
expect((await policy.assess('project.settings.set', {
  setting: 'application/config/name', value: 'BLACKOUT'
})).risk).toBe('normal');
expect((await policy.assess('editor.close_scene', {})).risk).toBe('normal');
expect((await policy.assess('editor.close_scene', { discard_changes: true })).risk).toBe('risky');
```

Run `rtk proxy node node_modules/vitest/vitest.mjs run packages/server/test/routine-permissions.test.ts`. Expected before the fix: assertions showing routine actions classified as risky.

Set `GODOT_BIN=C:/Users/ramir/Desktop/Godot_v4.6.3-stable_win64.exe` and run `rtk proxy node node_modules/vitest/vitest.mjs run tests/integration/routine-native.test.ts`. Expected before the fix: stale metadata and close-without-save failures in a disposable fixture, not the user's project.

## 2. Apply the smallest scoped repairs

Files: `packages/server/src/security/routine-project-settings.ts`, `packages/server/src/security/tool-policy.ts`, `packages/server/src/tools/recovery-tools.ts`, `packages/godot-addon/addons/godot_mcp/bridge/handlers/recovery_handlers.gd`, `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`, `packages/godot-addon/addons/godot_mcp/bridge/handlers/script_handlers.gd`, `packages/protocol/src/tools.ts`.

- [x] Add `isRoutineProjectSetting(args, files): Promise<boolean>` validating plain safe values and existing ordinary project resources. Do not grant arbitrary keys or change permission defaults.
- [x] Remove unconditional risky classification for six controlled headless operations. Keep their process/project permissions, target restrictions and manager-owned stop.
- [x] Make close normal only when `discard_changes` is omitted/false. Save existing named scenes first and refuse to close if saving is unavailable/fails. Explicit discard skips save but still needs approval. Refuse default closing on old addons without `safeCloseSupported`.
- [x] Forward close parameters through the registrar and dispatcher.
- [x] Compile GDScript disk source in a new resource, reject compilation failure, and label disk versus attached/compiled-resource metadata. Preserve live scripts and attached-node semantics.

Native safety contract:

```gdscript
if not params.get("discard_changes", false):
    if root.scene_file_path.is_empty():
        return _error("SCENE_SAVE_REQUIRED", "Save this unnamed scene before closing it")
    var save_error: int = _editor.call("save_scene")
    if save_error != OK:
        return _error("SCENE_SAVE_FAILED", "Scene was not closed because saving failed")
var close_error: int = _editor.call("close_scene")
```

## 3. Update contracts and verify preservation

Files: `scripts/tool-contracts.json`, generated catalog/policy/inventory, `packages/server/src/mcp/register-script-tools.ts`, `packages/server/test/tool-policy.test.ts`, `docs/tools/security.md`.

- [x] Update tool descriptions/risk metadata and regenerate with `rtk proxy npm run generate:tool-contracts`.
- [x] Update legacy assertions to the new normal headless classification; keep stale/replay, disabled permission, overwrite, reflection and recovery tests intact.
- [x] Run focused regressions again, then `rtk proxy npm test`, `rtk proxy npm run typecheck`, `rtk proxy npm run check:docs`, and native integration/addon validation with `GODOT_BIN` set.
- [x] Review `git diff --check` and the scoped diff. Record verified counts and remaining limitations in `docs/validation/2026-10-14-routine-permissions.md`.
- [x] Prepare the source repair without publishing or installing into the user's projects in this task.

Acceptance: routine registrar calls actually run without elicitation; risky cases still do not run without approval; native save failure never closes; fresh inspection never changes cached live metadata. No claim of live deployment until separately installed and restarted.
