# Godot MCP Single-Package Distribution B2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Godot MCP as one scoped public npm package, `@srdarkx/godot-mcp`, whose single tarball contains the existing internal protocol, server, and Godot addon workspaces and works from an unrelated clean consumer.

**Architecture:** Keep the npm-workspaces monorepo and exact internal `0.1.0` dependencies. The existing CLI workspace becomes the public package; release assembly temporarily creates package-local links under `packages/cli/node_modules/@godot-mcp`, lets npm's native `bundleDependencies` machinery pack those linked workspaces, validates the exact tarball shape, and removes only the links it created in `finally`.

**Tech Stack:** Node.js >=22, npm workspaces, TypeScript, Vitest, Node `node:test`, npm pack/publish dry-run, MCP stdio client, Godot 4.6.3 Windows validation.

**Spec:** `docs/superpowers/specs/2026-09-07-godot-mcp-single-package-distribution-design-b2.md`

## Global Constraints

- Baseline implementation commit is `9514791` (`feat(cli): add zero-friction project bootstrap`).
- Root package must be private `godot-mcp-monorepo` at version `0.1.0`.
- Sole public package must be `@srdarkx/godot-mcp` at version `0.1.0`; do not bump to `0.2.0` during implementation.
- Internal package names remain exactly `@godot-mcp/protocol`, `@godot-mcp/server`, and `@godot-mcp/godot-addon`.
- Public package runtime dependencies on those three internal packages remain exact `0.1.0` semver strings; never convert them to `file:`.
- `bundleDependencies` must contain exactly those three internal package names and no others.
- Package-local links are release-assembly state only; create only the managed internal paths and remove only paths created by the current invocation.
- Use Windows directory junctions on Windows and directory symlinks on POSIX.
- Public consumer install receives one tarball only; no separate internal tarball installation and no runtime source-tree fallback.
- No esbuild, rollup, tsup, wrapper public package, internal npm publication, real npm publish, GitHub Release, push, merge, or version bump without explicit authorization.
- Do not claim release readiness until the real scoped publish dry-run and the complete Windows Godot 4.6.3 runner have fresh observed GREEN evidence.

---

### Task 1: Public Package Identity and Metadata Contract

**Files:**
- Create: `scripts/check-public-package.mjs`
- Modify: `package.json`
- Modify: `packages/cli/package.json`
- Regenerate with npm: `package-lock.json`

**Interfaces:**
- Consumes: existing root/CLI manifests and root version `0.1.0`.
- Produces: root identity `godot-mcp-monorepo`; public workspace identity `@srdarkx/godot-mcp`; root script `check:public-package`; exact internal dependency and `bundleDependencies` contract.

- [ ] **Step 1: Add the metadata checker before production manifest changes**

Create `scripts/check-public-package.mjs`:

```js
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
const cli=JSON.parse(await fs.readFile(new URL('../packages/cli/package.json',import.meta.url),'utf8'));
const internal=['@godot-mcp/protocol','@godot-mcp/server','@godot-mcp/godot-addon'];

assert.equal(root.name,'godot-mcp-monorepo');
assert.equal(root.private,true);
assert.equal(cli.name,'@srdarkx/godot-mcp');
assert.equal(cli.private,false);
assert.equal(cli.version,root.version);
assert.deepEqual(cli.bin,{'godot-mcp':'dist/index.js'});
for(const name of internal){
 assert.equal(cli.dependencies?.[name],root.version,`${name} must be an exact runtime dependency`);
 assert(cli.bundleDependencies?.includes(name),`${name} must be bundled`);
}
assert.deepEqual(new Set(cli.bundleDependencies??[]),new Set(internal));
assert.equal(cli.bundleDependencies?.length,internal.length);
console.log(`Public package metadata valid: ${cli.name}@${cli.version}`);
```

- [ ] **Step 2: Run the checker and verify the intended RED**

Run:

```bash
node scripts/check-public-package.mjs
```

Expected: non-zero exit because the root is still `godot-mcp` and/or the CLI is still private `@godot-mcp/cli`. A syntax/environment failure is not an acceptable RED.

- [ ] **Step 3: Apply the minimal manifest changes**

Change root `package.json` only as follows:

```json
{
  "name": "godot-mcp-monorepo",
  "private": true,
  "scripts": {
    "build": "npm run check:tool-contracts && npm run build --workspace @godot-mcp/protocol && npm run build --workspace @godot-mcp/server && npm run build --workspace @srdarkx/godot-mcp",
    "test": "npm run build && npm run test --workspace @godot-mcp/protocol && npm run test --workspace @godot-mcp/server && npm run test --workspace @srdarkx/godot-mcp",
    "typecheck": "npm run build && npm run typecheck --workspace @godot-mcp/protocol && npm run typecheck --workspace @godot-mcp/server && npm run typecheck --workspace @srdarkx/godot-mcp",
    "check:public-package": "node scripts/check-public-package.mjs"
  }
}
```

Preserve every unrelated existing root script and dependency.

Change `packages/cli/package.json` identity/visibility and add exactly:

```json
{
  "name": "@srdarkx/godot-mcp",
  "version": "0.1.0",
  "private": false,
  "bundleDependencies": [
    "@godot-mcp/protocol",
    "@godot-mcp/server",
    "@godot-mcp/godot-addon"
  ]
}
```

Preserve its existing bin, files, metadata, and exact internal dependencies.

- [ ] **Step 4: Regenerate the lockfile through a normal npm install**

Run:

```bash
npm install --ignore-scripts --no-audit --no-fund
```

Expected: exit 0. Do not use `--package-lock-only`, and never hand-edit `package-lock.json`.

- [ ] **Step 5: Verify GREEN metadata and lockfile identity**

Run:

```bash
npm run check:public-package
node -e "const l=require('./package-lock.json'); if(l.name!=='godot-mcp-monorepo') process.exit(1); const p=l.packages['packages/cli']; if(p.name!=='@srdarkx/godot-mcp') process.exit(1); console.log('lockfile public identity valid')"
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json package-lock.json packages/cli/package.json scripts/check-public-package.mjs
git commit -m "build: define public scoped godot-mcp package"
```

---

### Task 2: Generated Client Config Targets the Scoped Public Package

**Files:**
- Modify test first: `packages/cli/test/client-config.test.ts`
- Modify production: `packages/cli/src/setup/client-config.ts`

**Interfaces:**
- Consumes: public package identity `@srdarkx/godot-mcp` from Task 1.
- Produces: `DEFAULT_NPX_PACKAGE='@srdarkx/godot-mcp'` and generated `npx --yes @srdarkx/godot-mcp start ...` entries.

- [ ] **Step 1: Change the existing client-config assertion first**

Replace only the expected old package in `packages/cli/test/client-config.test.ts`:

```ts
expect(parsed.mcpServers['godot-mcp']).toEqual({
 command:'npx',
 args:['--yes','@srdarkx/godot-mcp','start',path.resolve(root),'--tool-profile','2d']
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test --workspace @srdarkx/godot-mcp -- test/client-config.test.ts
```

Expected: FAIL showing actual `@godot-mcp/cli` versus expected `@srdarkx/godot-mcp`.

- [ ] **Step 3: Apply the one-line production change**

In `packages/cli/src/setup/client-config.ts`:

```ts
export const DEFAULT_NPX_PACKAGE='@srdarkx/godot-mcp';
```

- [ ] **Step 4: Re-run the focused test**

```bash
npm run test --workspace @srdarkx/godot-mcp -- test/client-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/cli/src/setup/client-config.ts packages/cli/test/client-config.test.ts
git commit -m "feat(cli): target scoped public package"
```

---

### Task 3: Safe Package-Local Workspace Link Materialization

**Files:**
- Create test first: `scripts/package-local-bundles.test.mjs`
- Create production: `scripts/package-local-bundles.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `INTERNAL_BUNDLED_PACKAGES`; `materializeBundledWorkspaceLinks({root,packageDir}) -> Promise<() => Promise<void>>`.
- Contract: create exactly three links, reject conflicting existing paths, and cleanup only paths created by this invocation.

- [ ] **Step 1: Write Node tests for creation, cleanup, and conflict fail-closed behavior**

Create `scripts/package-local-bundles.test.mjs` using `node:test`. The tests must:

1. create a temp repo with `packages/cli`, `packages/protocol`, `packages/server`, and `packages/godot-addon`;
2. call `materializeBundledWorkspaceLinks` and assert all three paths under `packages/cli/node_modules/@godot-mcp` are links/directories resolving to their workspace targets;
3. call the returned cleanup and assert all three managed paths are gone;
4. create an unrelated real directory at `packages/cli/node_modules/@godot-mcp/protocol`, then assert materialization rejects with `/Refusing to replace existing package-local path/` and leaves that real directory untouched;
5. create a sibling unrelated entry under `packages/cli/node_modules/@godot-mcp/other` and assert cleanup does not remove it.

Import:

```js
import {INTERNAL_BUNDLED_PACKAGES,materializeBundledWorkspaceLinks} from './package-local-bundles.mjs';
```

- [ ] **Step 2: Add the root release-script test command and verify RED**

Add:

```json
"test:release-scripts": "node --test scripts/*.test.mjs"
```

Run:

```bash
npm run test:release-scripts
```

Expected: FAIL because `scripts/package-local-bundles.mjs` does not exist yet.

- [ ] **Step 3: Implement the minimal cross-platform materializer**

Create `scripts/package-local-bundles.mjs` with:

```js
import fs from 'node:fs/promises';
import path from 'node:path';

export const INTERNAL_BUNDLED_PACKAGES=Object.freeze([
 ['@godot-mcp/protocol','protocol'],
 ['@godot-mcp/server','server'],
 ['@godot-mcp/godot-addon','godot-addon']
]);

async function pathExists(file){
 try{await fs.lstat(file);return true;}catch(error){if(error?.code==='ENOENT')return false;throw error;}
}

export async function materializeBundledWorkspaceLinks({root,packageDir}){
 const created=[];
 const scopeDir=path.join(packageDir,'node_modules','@godot-mcp');
 await fs.mkdir(scopeDir,{recursive:true});
 try{
  for(const [,folder] of INTERNAL_BUNDLED_PACKAGES){
   const target=path.join(root,'packages',folder);
   const link=path.join(scopeDir,folder);
   await fs.stat(path.join(target,'package.json'));
   if(await pathExists(link))throw new Error(`Refusing to replace existing package-local path: ${link}`);
   const relative=path.relative(path.dirname(link),target);
   await fs.symlink(process.platform==='win32'?target:relative,link,process.platform==='win32'?'junction':'dir');
   created.push(link);
  }
 }catch(error){
  for(const link of created.reverse())await fs.rm(link,{force:true,recursive:true});
  throw error;
 }
 return async()=>{
  for(const link of created.reverse())await fs.rm(link,{force:true,recursive:true});
 };
}
```

Do not remove the parent scope directory because it may contain unrelated entries.

- [ ] **Step 4: Run release-script tests GREEN**

```bash
npm run test:release-scripts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add package.json scripts/package-local-bundles.mjs scripts/package-local-bundles.test.mjs
git commit -m "build: materialize bundled workspace links"
```

---

### Task 4: Replace Four-Tarball Release Pack with One Validated Public Artifact

**Files:**
- Modify test first: `scripts/package-local-bundles.test.mjs`
- Replace production behavior: `scripts/pack-release.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `materializeBundledWorkspaceLinks` and `INTERNAL_BUNDLED_PACKAGES` from Task 3.
- Produces: `packRelease()` returning `{out,pkg}` for exactly one public tarball; `publishDryRun()` using the same materialization/cleanup path.

- [ ] **Step 1: Add pure validation tests before changing the packer**

Extend the release-script tests to import:

```js
import {assertExactBundled,assertPackedFiles} from './pack-release.mjs';
```

Add tests proving:

```js
assertExactBundled(['@godot-mcp/protocol','@godot-mcp/server','@godot-mcp/godot-addon']);
assert.throws(()=>assertExactBundled([]),/Bundled dependency mismatch/);
assert.throws(()=>assertExactBundled(['@godot-mcp/protocol']),/Bundled dependency mismatch/);
```

Use an allowed file list containing at minimum:

```text
package.json
LICENSE
README.md
dist/index.js
node_modules/@godot-mcp/protocol/package.json
node_modules/@godot-mcp/protocol/dist/index.js
node_modules/@godot-mcp/server/package.json
node_modules/@godot-mcp/server/dist/index.js
node_modules/@godot-mcp/godot-addon/package.json
node_modules/@godot-mcp/godot-addon/addons/godot_mcp/plugin.gd
node_modules/@godot-mcp/godot-addon/addons/godot_mcp/runtime/runtime_logger_46.gd.txt
```

and assert `assertPackedFiles` accepts it, while lists missing each required runtime entry or containing `.godot-mcp/` fail.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm run test:release-scripts
```

Expected: FAIL because the validation exports do not exist.

- [ ] **Step 3: Rewrite `pack-release.mjs` around one public workspace**

Keep the existing npm spawn wrapper, SHA-256 release manifest, random output directory, documentation checks, and fail-closed philosophy. Replace the four-package loop with:

```js
const PUBLIC_PACKAGE='@srdarkx/godot-mcp';
const REQUIRED_BUNDLED=INTERNAL_BUNDLED_PACKAGES.map(([name])=>name);
```

Export:

```js
export function assertExactBundled(actual){ /* set equality + exact length */ }
export function assertPackedFiles(files){ /* required public/internal entries + no .godot-mcp leakage */ }
export async function packRelease(){ /* materialize -> npm pack -> validate -> finally cleanup */ }
export async function publishDryRun(){ /* materialize -> npm publish --dry-run --access public -> finally cleanup */ }
```

`packRelease()` must invoke exactly:

```js
npm(['pack','--json','--ignore-scripts','--workspace',PUBLIC_PACKAGE,'--pack-destination',out],root)
```

Require npm pack metadata `bundled` to equal exactly the three internal names, validate required files, hash only the single tarball, and write a release manifest shaped like:

```json
{
  "version": "0.1.0",
  "private": true,
  "node": "<runtime>",
  "package": {
    "name": "@srdarkx/godot-mcp",
    "version": "0.1.0",
    "filename": "srdarkx-godot-mcp-0.1.0.tgz",
    "sha256": "...",
    "bytes": 123,
    "bundled": ["..."],
    "files": ["..."]
  }
}
```

`publishDryRun()` must use the same materializer and invoke:

```js
npm(['publish','--dry-run','--access','public','--ignore-scripts','--workspace',PUBLIC_PACKAGE,'--json'],root)
```

The CLI entrypoint for `scripts/pack-release.mjs` must run `publishDryRun()` only when passed `--publish-dry-run`; otherwise it runs `packRelease()`.

- [ ] **Step 4: Add the dry-run script**

Add without changing the no-publish rule:

```json
"release:dry-run": "npm run build && node scripts/pack-release.mjs --publish-dry-run"
```

- [ ] **Step 5: Run unit validation and the real pack**

```bash
npm run test:release-scripts
npm run release:pack
```

Expected: tests PASS; pack exits 0; output contains exactly one `srdarkx-godot-mcp-0.1.0.tgz`; pack JSON reports exactly the three bundled internal packages.

- [ ] **Step 6: Verify cleanup after the real pack**

Run:

```bash
node -e "const fs=require('fs'); for(const n of ['protocol','server','godot-addon']){if(fs.existsSync('packages/cli/node_modules/@godot-mcp/'+n)) process.exit(1)} console.log('managed pack links cleaned')"
```

Expected: exit 0.

- [ ] **Step 7: Commit Task 4**

```bash
git add package.json scripts/pack-release.mjs scripts/package-local-bundles.test.mjs
git commit -m "build: pack one scoped public artifact"
```

---

### Task 5: Independent Consumer Installs One Tarball Only

**Files:**
- Modify: `scripts/smoke-release.mjs`

**Interfaces:**
- Consumes: `packRelease()` returning one `pkg` from Task 4.
- Produces: distribution acceptance proving installation/runtime from a single public tarball and bundled internal package paths.

- [ ] **Step 1: Change smoke assertions before adapting installation**

Update the expected installed entry to:

```js
const publicRoot=path.join(consumer,'node_modules/@srdarkx/godot-mcp');
const entry=path.join(publicRoot,'dist/index.js');
```

Add assertions before CLI execution for:

```js
await fs.stat(path.join(publicRoot,'node_modules/@godot-mcp/protocol/dist/index.js'));
await fs.stat(path.join(publicRoot,'node_modules/@godot-mcp/server/dist/index.js'));
await fs.stat(path.join(publicRoot,'node_modules/@godot-mcp/godot-addon/addons/godot_mcp/plugin.gd'));
await fs.stat(path.join(publicRoot,'node_modules/@godot-mcp/godot-addon/addons/godot_mcp/runtime/runtime_logger_46.gd.txt'));
```

Change generated client config expectation to `@srdarkx/godot-mcp`.

- [ ] **Step 2: Run distribution smoke and verify RED against old four-tarball contract**

```bash
npm run test:distribution
```

Expected: FAIL until the install command/result shape is updated to Task 4's single package.

- [ ] **Step 3: Install exactly the one public tarball**

Replace:

```js
...packed.packages.map(...)
```

with exactly:

```js
path.join(packed.out,packed.pkg.filename)
```

The npm install argument list must contain no internal tarball path.

Retain the existing CLI help, `init`, addon-copy, tool-profile, Codex recipe, MCP `session.status`, `status`, and `stop` checks. Require the Codex server recipe path to resolve within `publicRoot` rather than merely somewhere inside the consumer.

- [ ] **Step 4: Strengthen validation output**

Write `consumer-validation.json` with checks including:

```text
one public tarball install
bundled protocol entry
bundled server entry
bundled addon plugin
bundled runtime logger
CLI help
addon init
scoped client bootstrap
tool profile persistence
Codex recipe inside public package
MCP session.status
authenticated status and stop
```

- [ ] **Step 5: Run the distribution smoke twice**

```bash
npm run test:distribution
npm run test:distribution
```

Expected: both runs PASS from separate temporary consumers.

- [ ] **Step 6: Commit Task 5**

```bash
git add scripts/smoke-release.mjs
git commit -m "test(distribution): prove one-tarball install"
```

---

### Task 6: Public Documentation and Stale Package Reference Cleanup

**Files:**
- Modify: `docs/zero-friction-setup.md`
- Modify: `README.md`
- Modify only if they describe current user-facing package commands: other active docs found by grep.

**Interfaces:**
- Consumes: final scoped command contract from Tasks 1-5.
- Produces: user-facing commands consistently using `@srdarkx/godot-mcp` while historical implementation plans remain untouched.

- [ ] **Step 1: Find stale active references**

Run:

```bash
grep -R "@godot-mcp/cli\|npx .*godot-mcp" -n README.md docs --exclude-dir=superpowers/plans --exclude='*design*.md'
```

Record only current user-facing docs; do not rewrite old historical plans.

- [ ] **Step 2: Update current commands**

At minimum change zero-friction examples to:

```powershell
npx -y @srdarkx/godot-mcp init . --client antigravity
npx -y @srdarkx/godot-mcp init . --client cursor --tool-profile 2d
```

Document that `@srdarkx/godot-mcp` is the sole public package and internal `@godot-mcp/*` packages are bundled implementation details.

- [ ] **Step 3: Verify no stale active package command remains**

Run:

```bash
if grep -R "npx .*@godot-mcp/cli" -n README.md docs --exclude-dir=superpowers/plans --exclude='*design*.md'; then exit 1; else echo 'active docs use scoped public package'; fi
```

Expected: exit 0.

- [ ] **Step 4: Commit Task 6**

```bash
git add README.md docs/zero-friction-setup.md
git commit -m "docs: document scoped single-package install"
```

---

### Task 7: Focused Regression Gates and Artifact Audit

**Files:**
- No production changes expected; fix only genuine regressions caused by Tasks 1-6.

**Interfaces:**
- Consumes: completed B2 implementation.
- Produces: fresh local evidence for metadata, release scripts, CLI tests, build/typecheck, one-tarball pack, and independent consumer runtime.

- [ ] **Step 1: Run metadata and release-script checks**

```bash
npm run check:public-package
npm run test:release-scripts
```

Expected: PASS.

- [ ] **Step 2: Run CLI unit tests and typecheck under the new workspace selector**

```bash
npm run test --workspace @srdarkx/godot-mcp
npm run typecheck --workspace @srdarkx/godot-mcp
```

Expected: PASS.

- [ ] **Step 3: Run repository build and typecheck**

```bash
npm run build
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run one-tarball pack and distribution smoke again**

```bash
npm run release:pack
npm run test:distribution
```

Expected: PASS and exactly one public tarball per release output directory.

- [ ] **Step 5: Audit repository state**

```bash
git diff --check
git status --short
grep -R '"@godot-mcp/[^\"]*": "file:' -n package.json packages/*/package.json || true
```

Expected: no whitespace errors, no accidental `file:` dependencies, and no managed package-local link left behind.

- [ ] **Step 6: Commit any test-only regression correction if and only if required**

If no correction was needed, do not create an empty commit. If a genuine B2 regression required a minimal fix, commit only that fix with an explanatory message.

---

### Task 8: Release-Readiness Gates Without Publishing

**Files:**
- No code changes expected.

**Interfaces:**
- Consumes: Task 7 GREEN implementation.
- Produces: evidence checklist; does not publish, merge, push, release, or bump version.

- [ ] **Step 1: Run scoped npm publication dry-run in an environment with registry access**

```powershell
npm run release:dry-run
```

Expected: exit 0, package identity `@srdarkx/godot-mcp@0.1.0`, and bundled list containing exactly the three internal `@godot-mcp/*` packages. This command is dry-run only.

- [ ] **Step 2: Verify managed links were cleaned after dry-run**

```powershell
@('protocol','server','godot-addon') | ForEach-Object {
  if (Test-Path "packages/cli/node_modules/@godot-mcp/$_") { throw "Managed link leaked: $_" }
}
```

Expected: no exception.

- [ ] **Step 3: Run the canonical Windows Godot 4.6.3 runner**

```powershell
$env:GODOT_BIN="C:\Users\ramir\Desktop\Godot_v4.6.3-stable_win64.exe"
powershell -ExecutionPolicy Bypass -File .\scripts\run-all-gates.ps1
```

Expected: every existing build, typecheck, unit, addon, integration, runtime, visual, headless, and debugger gate reports GREEN. Stop on the first real failure and do not claim release readiness.

- [ ] **Step 4: Verify public scope control separately before any future real publish**

Use authenticated npm account evidence to prove control of the `srdarkx` scope. Package-name search alone is not ownership proof.

- [ ] **Step 5: Record status without performing release actions**

Report whether B2 is release-ready based on observed evidence. Do not run `npm publish`, bump to `0.2.0`, push, merge, or create a GitHub Release without a new explicit authorization.
