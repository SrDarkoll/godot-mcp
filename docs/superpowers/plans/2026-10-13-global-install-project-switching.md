# Global installation and project switching implementation plan

> Execute inline with regression tests before changing the packaging contract. Preserve existing client settings, maps, open editors and unrelated processes. Do not publish an npm release without separate authorization.

**Goal:** Repair the reproducible Windows global installation failure and verify reopening independent project sessions with the installed artifact.

**Architecture:** Package the complete production dependency closure rather than only internal workspace packages. Materialize temporary package-local links from the installed dependency graph and clean only links owned by the pack operation. Test the actual tarball in isolated local/global consumers, including upgrade-in-place and A/B/A MCP sessions.

**Tech stack:** Node 24.21.0, npm, node:test, TypeScript, MCP SDK stdio client.

## Baseline

- Published 0.6.3 tarball SHA-1: aebadf79e5d574bccd4c2c6b636214491c34aa3f.
- Local installation of that tarball starts successfully.
- Fresh global-prefix installation fails before initialize with ERR_MODULE_NOT_FOUND for zod/v4. npm ls reports zod, ws and @modelcontextprotocol/server invalid.
- Existing distribution smoke tests cover a local install only; generated client entries can select an existing global installation through npx.
- The affected project's approved recovery config uses the verified source server with a retained backup and required=true. It is a temporary recovery, not the package fix.

## Tasks

- [x] Preserve and replace only the affected project's broken npm launch command with the verified local server.
- [x] Reproduce the published artifact in fresh isolated local/global prefixes.
- [x] Add a failing metadata regression: a public package must not leave production dependencies outside its explicit bundled set.
- [x] Materialize the external production dependency closure for packaging; retain conflict protection and owned-link cleanup.
- [x] Expand package validation and fixtures to cover required production manifests and ESM entry points, excluding dev tools and project state.
- [x] Extend scripts/smoke-release.mjs: local install, fresh global install, upgrade-in-place, two independent project initializations, A/B/A stdio initialize and session.status, project-local config retention. Versioned offline npx was additionally checked against the repaired actual global installation.
- [x] Run release-script tests, package checks, build, unit tests and installed-artifact smoke validation.
- [x] Validate the affected project's configured stdio initialize without editing its scene or stopping its editor; restore its normal npx launch after repairing npm.
- [x] Produce a focused evidence report, with limitations and release/publication boundary explicit.

## File responsibilities

- packages/cli/package.json: explicit production bundle seeds.
- scripts/package-local-bundles.mjs and .test.mjs: dependency closure and conservative temporary links.
- scripts/pack-release.mjs and .test.mjs: tarball metadata and file contract.
- scripts/check-public-package.mjs and .test.mjs: reject incomplete bundle metadata before packaging.
- scripts/smoke-release.mjs: installed consumer regressions and multiroot session checks.
- docs/testing/2026-10-13-global-install-project-switching.md: observed results, artifacts and remaining scope.

## Verification commands

```powershell
rtk proxy npm run test:release-scripts
rtk proxy npm run check:public-package
rtk proxy npm run build
rtk proxy npm run test:distribution
rtk proxy npm test
```

Acceptance requires a global installed artifact to execute --help and complete MCP initialize, not merely npm install exiting zero. The reopened A session must report A's root; stopping A must not stop B. These tests do not certify every Godot editor UI interaction or promise universal 100% reliability.

## Authorized publication: 0.6.4

The user explicitly authorized npm publication after reviewing the repair results.

- [x] Confirm npm account and that latest is still 0.6.3.
- [x] Synchronize workspace manifests, lockfile, protocol/addon constants and version test to 0.6.4.
- [x] Validate the final 0.6.4 artifact and installed consumer matrix.
- [x] Publish the exact validated tarball with the latest tag; do not create a GitHub release.
- [x] Download and verify the registry artifact, then test a clean global installation from npm.
- [x] Record publication evidence without stopping or migrating the user's open projects.

## Authorized GitHub publication: v0.6.4

The user subsequently requested publication on GitHub as well.

- [ ] Commit the scoped release changes and push release/0.6.4 for the protected branch checks.
- [ ] Wait for validate (22) and validate (24), then fast-forward main without bypassing protection.
- [ ] Publish v0.6.4 with user-facing notes, the exact npm tarball and SHA256SUMS.txt.
- [ ] Verify the release tag commit and downloaded asset checksum.
