# Windows global installation and multiple-project startup regression

Date: 2026-10-13. Node 24.21.0, npm 11.6.4, Windows. Source checkout: godot-mcp-hardening, version 0.6.3.

Local project names, absolute consumer paths and session identifiers are redacted in this public report. Full local evidence remains outside version control.

## Confirmed failure

The affected project launched `npx --yes @srdarkx/godot-mcp@0.6.3 start <project> --tool-profile full`, with `required=true`. Codex logs recorded `ERR_MODULE_NOT_FOUND` for `zod/v4`, followed by a closed MCP initialize connection and a failed chat resume. The installed package's `node_modules/zod` directory was empty.

The published 0.6.3 artifact was downloaded from npm, not reconstructed from the workspace. Its SHA-1 was `aebadf79e5d574bccd4c2c6b636214491c34aa3f`.

Independent-prefix reproduction:

- Local installation of that artifact: CLI `--help` passed.
- Fresh global-prefix installation of the same artifact: CLI `--help` failed with the same `zod/v4` resolution error.
- `npm ls --global --all` reported invalid `zod`, `ws` and `@modelcontextprotocol/server` in that isolated installation.

This reproduced the failure without the user's old global installation or an open Godot editor. The package's incomplete production bundle and the missing global-install regression were actionable defects. This is not a claim about npm's internal implementation or all npm versions.

## Correction

The public package now explicitly bundles its production runtime, including SDK core/server, Zod, ws and smol-toml. Packaging resolves production dependencies inside the workspace, materializes temporary links, and fails on missing packages, conflicting resolutions or existing paths. Cleanup unlinks only paths created by that pack operation; tests verify preservation of original packages and unrelated siblings.

Release gates now reject a manifest with production dependencies outside the bundle and require production manifests plus the Zod ESM entry in the tarball. The lockfile reflects the CLI dependency/bundle metadata.

The distribution consumer test now exercises the installed tarball through global installation, replacement of an older/broken artifact, repeated installation and independent project sessions. It uses default bridge configurations rather than assigning custom ports to hide conflicts.

No new server-routing implementation was necessary for the A/B/A test: the existing shared-session transport passed. No maps, game scenes or Godot addon source were changed by this fix.

## Verified results

| Check | Result |
| --- | --- |
| New incomplete-bundle regression before the fix | Failed as expected |
| Release-script suite after the fix | 19 passed |
| Public-package metadata gate | Passed |
| Build and tool contracts | Passed, 194 tool contracts current |
| Protocol unit suite | 56 passed |
| Server unit suite | 338 passed |
| CLI unit suite | 97 passed |
| Type checking | Passed |
| Documentation link check before this report | Passed, 92 Markdown files |
| Corrected tarball consumer validation | Passed |
| Actual global installation repaired from that tarball | npm install succeeded; dependency tree no longer reports the affected packages invalid |
| Actual `npx --offline --yes @srdarkx/godot-mcp@0.6.3 --version` | Returned 0.6.3 |
| Actual affected project configuration, restored to npx | MCP initialize and session.status passed; editor connected |

The installed-artifact consumer checked:

1. Local install and bundled protocol/server/addon entries.
2. Global install with complete production manifests and working CLI imports.
3. Replacement of the published broken 0.6.3 artifact by the corrected build in an isolated global prefix.
4. Reinstall of the corrected artifact without losing dependencies.
5. Two simultaneous project roots, one using 2d profile and the other full.
6. Close A, retain B's session ID, reopen A and verify its root.
7. Upgrade A without changing B's client configuration or session ID.
8. Existing upgrade preview, wrapper-replacement consent, backups and profile preservation checks.

These are SDK/stdio and installation checks. They do not certify every Godot GUI close/open sequence, every operating system, or universal 100% reliability.

## Artifacts and actual-project verification

Corrected artifact directory: `.godot-mcp/distribution/0.6.3-64867924`.

- `srdarkx-godot-mcp-0.6.3.tgz`, 3,178,470 bytes.
- SHA-256: `48a80b5dee01d3c5ec09d557c34ef52ae1d3ea41d47aee9158dd54246b7978cd`.
- `release-manifest.json`: package contents and eight bundled runtime packages.
- `consumer-validation.json`: successful installed-artifact checks.

The isolated consumer and published-baseline reproduction prefixes were retained under the local system temporary directory. Their absolute paths are omitted from this public report.

The affected project was temporarily pointed to the verified source server with a retained backup. After repairing the actual global installation, its original npx launch was restored, retaining `required=true`, timeout, profile and disabled duplicate alias. The standalone checker `scripts/check-client-startup.mjs` read that actual configuration and completed MCP initialize plus session.status without changing the config.

Actual status after the npx verification:

```json
{
  "sessionId": "<preserved-session-id>",
  "projectRoot": "<affected-project>",
  "editorConnected": true,
  "runtimeConnected": false,
  "godotVersion": "4.6.3-stable (official)",
  "addonVersion": "0.6.3",
  "protocolVersion": 1
}
```

The session ID remained unchanged, demonstrating that verification did not replace the active project owner. Another existing project server also continued to answer, with its editor disconnected. No manual editor/game process was stopped.

## Release boundary before the authorized publication

At the end of the initial repair, the corrected build was installed on this computer from the local tarball. It still identified as 0.6.3 for that repair; it was not the original npm artifact with that version. npm's `latest` tag remained 0.6.3 at that checkpoint. No publication had yet been authorized. The follow-up below records the subsequent requested npm publication.

A new package version is required to deliver this correction to other users. The original published 0.6.3 artifact cannot be replaced in place. A package install/update and an individual project's addon/config migration remain distinct operations; project isolation must not be removed to make an update appear global.

The Codex UI chat-resume action was not driven automatically. Its configured MCP launch was verified directly; the user can retry opening that chat without restarting all Godot editors.

## Authorized publication and registry verification: 0.6.4

The user authorized publication as 0.6.4. Workspace versions, protocol/addon constants, lock metadata and the version regression were synchronized. The 491 package unit tests, 19 release-script tests, type checks and final installed-consumer matrix passed again for 0.6.4.

The exact validated tarball was published to npm with public access and the latest tag. This checkpoint preceded the separate GitHub publication request. npm initially returned success with a HTTP 202 registry response while public reads still returned 404; publication was not declared verified at that point. Subsequent registry reads showed both version 0.6.4 and latest=0.6.4.

Final local artifact: `.godot-mcp/distribution/0.6.4-6950708d/srdarkx-godot-mcp-0.6.4.tgz`.

- Bytes: 3,178,472.
- SHA-256: `917a0dbb820723bbe1c0eaba3371dc423dccf10565d68e5db31cb82fcdc02682`.
- Registry SHA-1: `22c2f81cdfeb043748e2c3c0d0513c36a755d4cf`.
- Registry integrity: `sha512-tXvQx9h791gZsV1+pPI4ku31FWR+Pf6SnDC8n2SLolj1nvLbOlDI02mO91vpdQnQE8eGI0l0l+lItINymI2ceg==`.
- Public artifact: https://registry.npmjs.org/@srdarkx/godot-mcp/-/godot-mcp-0.6.4.tgz.

A fresh download from npm matched the validated artifact byte-for-byte by SHA-256. A clean global-prefix installation by package name/version succeeded. Its CLI returned 0.6.4 and initialized two temporary Godot projects. MCP stdio initialize, session.status and the full 194-tool catalog passed; reopening A preserved B's session ID.

The published-consumer prefix and fixtures were retained under the local system temporary directory. The pre-publication full consumer evidence is at `.godot-mcp/distribution/0.6.4-6950708d/consumer-validation.json`.

No project upgrade or shutdown command was issued against the actual user projects in this publication follow-up. A final read-only live check showed the affected project connected to Godot 4.6.3 with addon 0.6.4 and protocol 1. Its session differed from the earlier repair snapshot; no cause for the intervening state change is attributed here. Other projects still need their own explicit version migration when applicable, as described in [the release notes](../releases/0.6.4.md).
