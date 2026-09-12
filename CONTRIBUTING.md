# Contributing

Use Windows, Node 22 and the pinned Godot 4.6.3 executable for the currently verified target. Start with `npm ci` and `npm run build`. Keep unrelated working-tree changes and user projects intact.

Add a failing behavioral regression before a bug fix. Put protocol tests in `packages/protocol/test`, server/CLI tests in their package test directories and native scenarios in `tests/integration`. Run tests against isolated fixtures. Never terminate an editor or game that the test did not launch. Retain screenshots and recovery evidence.

Every MCP tool must be declared in `scripts/tool-contracts.json` and registered through the guarded registrar. Specify profile membership, static risk tags and dynamic behavior; implement argument-dependent checks where needed. Unknown tools fail closed. Run `npm run generate:tool-contracts` after changing the manifest, then require `npm run check:tool-contracts` to pass.

Before requesting review, run:

```powershell
npm test
npm run typecheck
npm run check:tool-contracts
npm run check:docs
npm run check:public-package
npm run test:release-scripts
$env:GODOT_BIN = 'C:\Tools\Godot_v4.6.3-stable_win64.exe'
npm run check:godot
$env:REQUIRE_GODOT_INTEGRATION = '1'
npm run test:integration
npm run test:distribution
```

Changes to rendering/runtime need the graphical suites as well. Set `GODOT_VISUAL_INTEGRATION=1` for `npm run test:integration:visual`, or `GODOT_RUNTIME_INTEGRATION=1` for `npm run test:integration:runtime`. Run these in an interactive graphical Windows session; do not label skipped checks as passing.

Describe the final behavior, relevant tests and remaining limitations. Include a reproducible fixture for failures, without tokens or private project data. See SECURITY.md for sensitive reports. Updating documentation or a working tree does not authorize publishing, tagging or pushing a release.
