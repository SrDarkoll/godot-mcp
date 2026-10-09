# Upgrade launcher UX implementation plan

**Goal:** Make the observed Node → retry script → source-checkout server installation upgradable without asking the user to edit Codex TOML.

**Architecture:** Build a read-only upgrade preview from verified package manifests and the existing launch arguments. Known npm launches retain their automatic migration. Source-checkout launches and local scripts followed by a verified server entry require explicit consent to replace the launcher with the version-pinned npm command. A single interactive confirmation covers launcher replacement and authenticated session shutdown. Backups, unrelated settings, rollback and session-identity checks remain mandatory.

**Scope:** Implement and validate locally, then release 0.6.2 to GitHub and npm under the user's continuing publication authorization. Migrating the user's smoke project remains a separate confirmed operation. Do not execute a custom launcher while inspecting it. Do not infer arbitrary custom launch arguments or adopt a different project.

**Stack:** TypeScript, smol-toml, existing CLI/management APIs, Vitest, Windows, Godot 4.6.3.

## 1. Reproduce and verify launcher identities

- [x] Add regression fixtures for the source checkout and `node wrapper.mjs server/dist/index.js --project ROOT`; a wrapper containing `throw new Error('must not execute')` must still be inspected without execution.
- [x] Validate ordinary server entry and package manifests. Accept the public bundle or the exact `godot-mcp-monorepo/packages/server` layout with its public CLI manifest. Reject unrelated manifests, links, missing files, unrecognized flags and mismatched project roots.
- [x] Return replacement metadata from `prepareCodexUpgrade`; require `{replaceLauncher:true}` in `applyCodexUpgrade` for those plans. Preserve the wrapper file and exact TOML backup.

```ts
export interface LauncherReplacement {
 kind: 'source_checkout' | 'wrapper';
 previous: ClientLaunchEntry;
 serverPath: string;
 wrapperPath?: string;
}
```

## 2. Preview and explicit approval

- [x] Add `previewUpgrade(options)` that reads configuration and authenticated session status without acquiring a lease, starting Godot, stopping the server or creating backups.
- [x] Add `confirmUpgrade(preview)` to `upgradeProject`, retaining the existing `confirmStop` API for npm migrations. `--yes` approves stopping the session; `--replace-launcher` separately approves replacing a custom/source launcher. Without approval, return `LAUNCHER_REPLACEMENT_REQUIRED` and a complete next command.
- [x] Bind consent to the inspected Codex bytes. If they change during confirmation or lease acquisition, cancel instead of adopting the changed configuration.

```ts
export interface UpgradePreview {
 projectRoot: string;
 fromVersion: string | null;
 toVersion: string;
 requires: {stopSession:boolean; replaceLauncher:boolean};
 nextCommand: string;
}
```

## 3. CLI flow and recovery guidance

- [x] Parse `upgrade --dry-run` and `init|upgrade --replace-launcher`; reject those options for unrelated commands.
- [x] Render the version change, configuration path, previous/proposed launcher, active session impact, backup location and approval requirements. Default interactive upgrade uses one confirmation for both sensitive changes. JSON/dry-run never prompts.
- [x] Let `init` route recognized custom/source installations into the same flow. Update upgrading documentation with the distinction between npm download consent, session shutdown consent and launcher replacement consent.

## 4. Verify the complete behavior

- [x] Run the focused CLI unit regressions first, then build/typecheck and the complete CLI suite.
- [x] Run the Godot upgrade integration suite: preview while a wrapper-backed session remains alive; refusal/cancellation preserves the session and all installation bytes; approved migration preserves options and backups; doctor failure restores the custom configuration; a concurrent configuration edit cancels before shutdown.
- [x] Run read-only preview on `GodotMcpSmoke` and record its recognized launcher and proposed npm command. Verify its original configuration and wrapper bytes remain unchanged.
- [x] Review the diff and document measured results. Keep release and actual smoke-project migration status explicit.
