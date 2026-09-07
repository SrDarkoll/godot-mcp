# Godot MCP Phase 8 — True Headless / Process Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side Godot-only headless process manager and eight typed canonical `headless.*` MCP tools that work without an editor bridge while preserving the existing safety, recovery, runtime, and profile invariants.

**Architecture:** `HeadlessProcessManager` is a new server-side subsystem parallel to `RuntimeService`. It owns at most one Godot child process per MCP session, constructs all argv from fixed templates, validates project-local `res://` targets, persists bounded JSONL output plus manifest records, and is exposed only through eight canonical tools. The existing editor/runtime bridge remains unchanged except for an environment marker that prevents MCP addon bridge startup inside manager-owned headless editor children.

**Tech Stack:** Node.js 22+, TypeScript 7, Zod 4, MCP TypeScript SDK 2, Vitest 4, Godot 4.6.3 stable, GDScript addon.

**Spec:** `docs/superpowers/specs/2026-09-06-godot-mcp-headless-process-manager-design.md`

## Global Constraints

- Baseline implementation parent is spec commit `80edb896c5d64c39b7f741b2af966c514b792e4f`; Phase 7.1 implementation tree is `03bd5a49cd6bebd4fb8987eeed3078647364727a` before docs.
- Only the configured Godot executable may be spawned; MCP arguments never select an executable, cwd, shell, or raw Godot argv.
- `headless.run_scene` accepts only an existing regular project-local `.tscn` target; `headless.run_tests` accepts only an existing regular project-local `.gd` target.
- `filesystem.external`, `process.shell`, `process.external`, and `network.external` remain disabled and are never required by `headless.*`.
- One active Godot child execution maximum per MCP session across all execution kinds.
- `headless.status`, `headless.get_output`, and `headless.stop` remain usable while recovery/transaction barriers exist; new headless starts do not.
- Output persisted per execution is capped at 512 KiB while pipes continue to be drained.
- Bounded-job timeout maximum is exactly 600,000 ms.
- The manifest keeps at most the latest 20 headless execution records and remains backward-compatible with manifests lacking `headlessRuns`.
- All eight `headless.*` tools are canonical typed bindings from first release.
- Expected profile counts are exactly `minimal=5`, `core=78`, `2d=121`, `3d=107`, `navigation=67`, `ui=81`, `runtime=38`, `full=173`.
- No generated catalog, generated policy, or generated tool inventory is hand-edited.
- No push, merge, release, or phase closure occurs without explicit user approval.

---

## File Structure

**Create**
- `packages/protocol/src/headless.ts` — public schemas and headless result/record types.
- `packages/server/src/headless/headless-paths.ts` — safe `res://` resolution with symlink/link escape rejection.
- `packages/server/src/headless/headless-output-store.ts` — bounded JSONL persistence and deterministic pagination.
- `packages/server/src/headless/headless-process-manager.ts` — process ownership, fixed argv construction, timeout/stop/state/manifest lifecycle.
- `packages/server/src/tools/headless-tools.ts` — context-first tool handlers.
- `packages/server/src/mcp/register-headless-tools.ts` — eight canonical binding declarations/registration.
- `packages/server/test/headless-paths.test.ts` — path hardening.
- `packages/server/test/headless-output-store.test.ts` — cap/pagination/session artifact behavior.
- `packages/server/test/headless-process-manager.test.ts` — one-child lifecycle, argv, timeout, stop, close, binary resolution.
- `packages/server/test/headless-tools.test.ts` — handler delegation and error propagation.
- `packages/server/test/headless-addon-contract.test.ts` — addon environment marker contract.
- `tests/integration/headless-process-manager.test.ts` — real Godot 4.6.3 no-editor lifecycle.
- `tests/integration/helpers/headless-test-runner.gd` — bounded `--script` fixture with known output/exit.
- `tests/integration/helpers/headless-persistent.gd` — persistent scene/runtime fixture output for start/status/stop.

**Modify**
- `packages/protocol/src/index.ts` — export headless protocol.
- `packages/protocol/src/tooling.ts` — add `headless` tool domain.
- `packages/protocol/src/session-artifacts.ts` — defaulted `headlessRuns` manifest field.
- `packages/server/src/session/session-store.ts` — initialize `headlessRuns` and `logs/headless` artifact directory.
- `packages/server/src/mcp/create-server.ts` — accept/register manager.
- `packages/server/src/index.ts` — resolve Godot binary, construct manager, close it before session finish.
- `packages/server/src/security/tool-policy.ts` — headless dynamic targets, stop fingerprint binding, barrier exemptions for read/stop.
- `packages/godot-addon/addons/godot_mcp/plugin.gd` — skip MCP bridge/debugger setup only for `GODOT_MCP_HEADLESS_CHILD=1`.
- `scripts/tool-contracts.json` — eight canonical tools, risk/profile/domain metadata.
- `scripts/generate-tool-contracts.mjs` — add `headless` domain and expected count 173.
- Generated artifacts via `npm run generate:tool-contracts` only.
- `packages/server/test/tool-contract-generator.test.ts`, `tool-catalog.test.ts`, `tool-policy.test.ts`, `session-store.test.ts`, `mcp-server.test.ts`, `integration-scripts.test.ts` — Phase 8 invariants.
- `scripts/run-integration.mjs` — include Phase 8 integration test in standard or explicit headless group without requiring a graphical editor.
- `README.md` / package docs only where existing tool/lifecycle documentation requires Phase 8 discovery notes.

---

### Task 1: Protocol, manifest, domain, and generator contract

**Files:**
- Create: `packages/protocol/src/headless.ts`
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/protocol/src/tooling.ts`
- Modify: `packages/protocol/src/session-artifacts.ts`
- Modify: `packages/server/src/session/session-store.ts`
- Modify: `scripts/generate-tool-contracts.mjs`
- Test: `packages/server/test/session-store.test.ts`
- Test: `packages/server/test/tool-contract-generator.test.ts`

**Interfaces:**
- Produces `HeadlessExecutionKindSchema`, `HeadlessExecutionStateSchema`, `HeadlessExecutionRecordSchema`, `HeadlessValidateProjectSchema`, `HeadlessImportSchema`, `HeadlessRunSchema`, `HeadlessRunSceneSchema`, `HeadlessRunTestsSchema`, `HeadlessStatusSchema`, `HeadlessStopSchema`, `HeadlessGetOutputSchema`, and their inferred TypeScript types.
- Produces manifest field `headlessRuns: HeadlessExecutionRecord[]` defaulting to `[]`.
- Adds protocol tool domain literal `'headless'`.

- [ ] **Step 1: Write failing protocol/manifest tests**

Add assertions that an old manifest without `headlessRuns` parses to `headlessRuns: []`, that `timeout_ms` defaults are 60_000/180_000/120_000 and rejects `600_001`, and that strict schemas reject `executable`, `cwd`, and `argv` fields.

```ts
expect(HeadlessRunSchema.safeParse({ executable: 'cmd.exe' }).success).toBe(false);
expect(HeadlessRunSceneSchema.safeParse({ scene_path: 'res://main.tscn', argv: ['--editor'] }).success).toBe(false);
expect(HeadlessValidateProjectSchema.parse({}).timeout_ms).toBe(60_000);
expect(HeadlessImportSchema.parse({}).timeout_ms).toBe(180_000);
expect(HeadlessRunTestsSchema.parse({ script_path:'res://tests/smoke.gd' }).timeout_ms).toBe(120_000);
expect(HeadlessRunTestsSchema.safeParse({script_path:'res://tests/smoke.gd',timeout_ms:600_001}).success).toBe(false);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:
```bash
npm run test --workspace @godot-mcp/server -- --run packages/server/test/session-store.test.ts packages/server/test/tool-contract-generator.test.ts
```
Expected: FAIL because headless protocol/domain/manifest fields do not exist and generator still expects 165 tools.

- [ ] **Step 3: Implement `packages/protocol/src/headless.ts`**

Use strict schemas. Core record shape:

```ts
export const HeadlessExecutionKindSchema=z.enum(['validate_project','import','run','run_scene','run_tests']);
export const HeadlessExecutionStateSchema=z.enum(['starting','running','stopping','exited','failed']);
export const HeadlessExecutionRecordSchema=z.strictObject({
  executionId:z.uuid(),kind:HeadlessExecutionKindSchema,state:HeadlessExecutionStateSchema,
  startedAt:z.iso.datetime(),endedAt:z.iso.datetime().nullable(),exitCode:z.number().int().nullable(),
  signal:z.string().nullable(),pid:z.number().int().positive().nullable(),scenePath:z.string().nullable(),
  scriptPath:z.string().nullable(),logPath:z.string().regex(/^logs\/headless\/[0-9a-f-]{36}\.jsonl$/),
  outputBytes:z.number().int().nonnegative().max(512*1024),outputTruncated:z.boolean(),
  timedOut:z.boolean(),stoppedByRequest:z.boolean(),errorCode:z.string().nullable()
});
const Timeout=z.number().int().min(1).max(600_000);
export const HeadlessValidateProjectSchema=z.strictObject({timeout_ms:Timeout.default(60_000)});
export const HeadlessImportSchema=z.strictObject({timeout_ms:Timeout.default(180_000)});
export const HeadlessRunSchema=z.strictObject({});
export const HeadlessRunSceneSchema=z.strictObject({scene_path:z.string().min(1).max(1024)});
export const HeadlessRunTestsSchema=z.strictObject({script_path:z.string().min(1).max(1024),timeout_ms:Timeout.default(120_000)});
export const HeadlessStatusSchema=z.strictObject({});
export const HeadlessStopSchema=z.strictObject({});
export const HeadlessGetOutputSchema=z.strictObject({execution_id:z.uuid().optional(),after:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(200).default(100)});
```

Export all types from `packages/protocol/src/index.ts`. Add `'headless'` to `ToolDomainSchema` and `TOOL_DOMAINS`. Change generator `DEFAULT_EXPECTED_COUNT` from 165 to 173.

- [ ] **Step 4: Add backward-compatible manifest field and session directory initialization**

In `SessionManifestSchema` add:

```ts
headlessRuns:z.array(HeadlessExecutionRecordSchema).max(20).default([]),
```

Initialize `headlessRuns:[]` in `SessionStore.create()` and add `'logs/headless'` to the ensured artifact directories.

- [ ] **Step 5: Run protocol/server focused tests and verify GREEN**

Run:
```bash
npm run build --workspace @godot-mcp/protocol
npm run test --workspace @godot-mcp/server -- --run packages/server/test/session-store.test.ts packages/server/test/tool-contract-generator.test.ts
```
Expected: protocol builds; manifest compatibility test passes; generator tests may still fail only because the eight contracts are intentionally added in Task 5, not because the domain/count constants reject 173.

- [ ] **Step 6: Commit protocol foundation**

```bash
git add packages/protocol/src packages/server/src/session packages/server/test/session-store.test.ts scripts/generate-tool-contracts.mjs packages/server/test/tool-contract-generator.test.ts
git commit -m "feat(headless): define phase 8 protocol state"
```

---

### Task 2: Hardened project-local target resolution

**Files:**
- Create: `packages/server/src/headless/headless-paths.ts`
- Create: `packages/server/test/headless-paths.test.ts`

**Interfaces:**
- Produces `resolveHeadlessTarget(projectRoot:string, resourcePath:string, extension:'.gd'|'.tscn'):Promise<{resourcePath:string;absolutePath:string}>`.
- Throws `BridgeRpcError('HEADLESS_INVALID_TARGET', ...)` for malformed, missing, non-file, linked, or escaping targets.

- [ ] **Step 1: Write failing target hardening tests**

Cover valid nested `.gd/.tscn`, and reject:

```text
../x.gd
res://../x.gd
res:\\tests\\x.gd
C:\\x.gd
file://x.gd
res://a//b.gd
res://a/../b.gd
res://a\b.gd
res://a.gd\0evil
wrong extension
missing file
symlink file
symlink/junction parent escape
```

Tests must create a real temp project and use `fs.symlink`/junction where the platform permits; on Windows use directory junction semantics where needed.

- [ ] **Step 2: Run focused test and verify RED**

```bash
npm run test --workspace @godot-mcp/server -- --run packages/server/test/headless-paths.test.ts
```
Expected: FAIL because module/function is absent.

- [ ] **Step 3: Implement resolver without string-prefix-only trust**

Implementation sequence:

```ts
if(!resourcePath.startsWith('res://')||!resourcePath.endsWith(extension)) invalid();
const relative=resourcePath.slice('res://'.length);
if(!relative||relative.includes('..')||relative.includes('\\')||relative.includes('\0')||relative.includes('//')||relative.includes(':')) invalid();
const rootReal=await fs.realpath(projectRoot);
const absolute=path.join(rootReal,...relative.split('/'));
const stat=await fs.lstat(absolute);
if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1) invalid();
const real=await fs.realpath(absolute);
if(real!==rootReal&&!real.startsWith(rootReal+path.sep)) invalid();
```

Also walk every parent segment from `rootReal` to the target with `lstat`; reject symbolic links/reparse links before trusting the final `realpath`.

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
npm run test --workspace @godot-mcp/server -- --run packages/server/test/headless-paths.test.ts
```
Expected: PASS on the current platform; link-specific cases may skip only when OS privileges make symlink creation impossible, with the non-link traversal cases still mandatory.

- [ ] **Step 5: Commit target hardening**

```bash
git add packages/server/src/headless/headless-paths.ts packages/server/test/headless-paths.test.ts
git commit -m "feat(headless): harden project target resolution"
```

---

### Task 3: Bounded output store

**Files:**
- Create: `packages/server/src/headless/headless-output-store.ts`
- Create: `packages/server/test/headless-output-store.test.ts`

**Interfaces:**
- Produces `HeadlessOutputStore(session:Session,sessions:SessionStore)`.
- Produces `append(executionId:string,stream:'stdout'|'stderr',text:string):Promise<{acceptedBytes:number;truncated:boolean}>`.
- Produces `page(executionId:string,after:number,limit:number):Promise<{entries:HeadlessOutputEntry[];nextCursor:number;truncated:boolean}>`.
- Persisted JSONL entry: `{sequence:number,timestamp:string,stream:'stdout'|'stderr',text:string}`.

- [ ] **Step 1: Write failing output-store tests**

Verify monotonically increasing sequence numbers, stable pagination, UTF-8 byte accounting, exact 512 KiB cap, drain-after-cap behavior represented by `acceptedBytes:0,truncated:true`, no path traversal through execution IDs because UUID is required by caller/schema, and symlinked log file rejection.

- [ ] **Step 2: Run focused test and verify RED**

```bash
npm run test --workspace @godot-mcp/server -- --run packages/server/test/headless-output-store.test.ts
```
Expected: FAIL because output store is absent.

- [ ] **Step 3: Implement append with bounded UTF-8 persistence**

Use `sessions.ensureDirectory(session.id,'logs/headless')`, validate existing log is not a symlink, append JSONL with `fs.open(file,'a')`, and never persist payload bytes past `512*1024`. Split incoming text only when necessary at a UTF-8-safe string boundary so `outputBytes <= 524288` always holds.

- [ ] **Step 4: Implement deterministic page reads**

Read the bounded JSONL file, parse each line strictly, select `sequence > after`, return at most `limit`, and derive `nextCursor` as the last returned sequence or `after` when empty. Treat malformed JSONL as `BridgeRpcError('HEADLESS_OUTPUT_FAILED', ...)` rather than returning partial forged history.

- [ ] **Step 5: Run focused test and verify GREEN**

```bash
npm run test --workspace @godot-mcp/server -- --run packages/server/test/headless-output-store.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit output store**

```bash
git add packages/server/src/headless/headless-output-store.ts packages/server/test/headless-output-store.test.ts
git commit -m "feat(headless): persist bounded process output"
```

---

### Task 4: `HeadlessProcessManager` lifecycle

**Files:**
- Create: `packages/server/src/headless/headless-process-manager.ts`
- Create: `packages/server/test/headless-process-manager.test.ts`
- Modify: `packages/server/src/project/project-config.ts` only if a small exported resolver helper is needed; do not alter config semantics.

**Interfaces:**
- Constructor: `new HeadlessProcessManager(session,sessions,{godotBin:string|null,env?:NodeJS.ProcessEnv,spawnImpl?:typeof spawn})`.
- Methods:
  - `validateProject(args:HeadlessValidateProjectParams):Promise<HeadlessExecutionRecord>`
  - `importProject(args:HeadlessImportParams):Promise<HeadlessExecutionRecord>`
  - `run():Promise<HeadlessExecutionRecord>`
  - `runScene(args:HeadlessRunSceneParams):Promise<HeadlessExecutionRecord>`
  - `runTests(args:HeadlessRunTestsParams):Promise<HeadlessExecutionRecord>`
  - `status():Promise<HeadlessStatusResult>`
  - `getOutput(args:HeadlessGetOutputParams):Promise<HeadlessOutputPage>`
  - `stop():Promise<HeadlessStopResult>`
  - `close():Promise<void>`

- [ ] **Step 1: Write RED tests for fixed argv and binary resolution**

With an injected `spawnImpl`, assert exact invocations:

```ts
['--headless','--path',root,'--editor','--quit']
['--headless','--path',root,'--import']
['--headless','--path',root]
['--headless','--path',root,'res://levels/test.tscn']
['--headless','--path',root,'--script','res://tests/test.gd']
```

Assert `{shell:false,cwd:root,env:{...,'GODOT_MCP_HEADLESS_CHILD':'1'}}`. Assert no user args can inject an executable or argv. Missing/unusable binary returns `HEADLESS_GODOT_UNAVAILABLE`; spawn error returns `HEADLESS_SPAWN_FAILED`.

- [ ] **Step 2: Write RED tests for ownership/state/concurrency**

Use a controllable fake child. Prove:
- second start while `starting/running/stopping` => `HEADLESS_BUSY`;
- `status/getOutput/stop` still function while child active;
- persistent run returns `running` after spawn;
- bounded job waits for `close` and returns `exited` with exact nonzero exit code rather than MCP error;
- only the currently owned child receives stop/kill calls.

- [ ] **Step 3: Write RED tests for timeout and shutdown**

For a bounded job with short injected timeout, assert final state `failed`, `timedOut:true`, `errorCode:'HEADLESS_TIMEOUT'`, and the child is terminated. For `close()`, assert graceful termination request then force-kill after a short fixed grace period only if child remains alive.

- [ ] **Step 4: Implement exact Godot binary resolution**

Before spawn, require configured path to resolve through `fs.realpath`, `lstat().isFile()`, and not be a symlink. The manager never reads a binary path from tool arguments. `runServer()` will supply `config.godotBin ?? process.env.GODOT_BIN ?? null` in Task 6.

- [ ] **Step 5: Implement active execution and spawn core**

Maintain one private active record/child pair. Generate `executionId=randomUUID()`, create manifest record with `starting`, persist it, then spawn. On successful `spawn` event transition to `running`; attach stdout/stderr listeners immediately and pass chunks to `HeadlessOutputStore` so pipes are always drained.

- [ ] **Step 6: Implement bounded completion and persistent start semantics**

Bounded methods wait for `close/error/timeout`. Persistent methods resolve after spawn/running unless the process exits first. Exit finalization writes `endedAt`, exact `exitCode`, `signal`, output counters/truncation, clears active ownership, and trims completed manifest history to 20 records.

- [ ] **Step 7: Implement stop/close**

`stop()` with no active child returns `{stopped:false,execution:null}`. With an active child: set `stopping`, set `stoppedByRequest:true`, request normal termination, wait fixed grace period, force-kill that child only if still alive, then return the finalized record. `close()` delegates to the same ownership-safe stop path and waits for final output flush.

- [ ] **Step 8: Run focused lifecycle tests and verify GREEN**

```bash
npm run test --workspace @godot-mcp/server -- --run packages/server/test/headless-process-manager.test.ts packages/server/test/headless-output-store.test.ts packages/server/test/headless-paths.test.ts
```
Expected: PASS.

- [ ] **Step 9: Commit process manager**

```bash
git add packages/server/src/headless packages/server/test/headless-process-manager.test.ts
git commit -m "feat(headless): manage one owned Godot child"
```

---

### Task 5: Canonical tool handlers, contracts, profiles, and generated artifacts

**Files:**
- Create: `packages/server/src/tools/headless-tools.ts`
- Create: `packages/server/src/mcp/register-headless-tools.ts`
- Create: `packages/server/test/headless-tools.test.ts`
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `scripts/tool-contracts.json`
- Regenerate: `packages/server/src/tooling/tool-catalog.generated.ts`
- Regenerate: `packages/server/src/security/tool-policy.generated.ts`
- Regenerate: `docs/generated/tool-inventory.md`
- Modify tests: `packages/server/test/mcp-server.test.ts`, `tool-catalog.test.ts`, `tool-contract-generator.test.ts`

**Interfaces:**
- Each handler is context-first and delegates only to `HeadlessProcessManager`.
- `registerHeadlessTools(registrar,manager)` binds all eight through `defineCanonicalToolBinding` + `bindCanonicalTool`.

- [ ] **Step 1: Write RED canonical registration tests**

Assert all eight names are observed under `runtime` and `full`, absent from the other six profiles, and direct `registerTool` bypass is rejected because manifest binding status is `canonical`.

- [ ] **Step 2: Implement context-first handlers**

Example pattern:

```ts
export function validateHeadlessProject(manager:HeadlessProcessManager,args:HeadlessValidateProjectParams){
  return manager.validateProject(HeadlessValidateProjectSchema.parse(args));
}
export function getHeadlessOutput(manager:HeadlessProcessManager,args:HeadlessGetOutputParams){
  return manager.getOutput(HeadlessGetOutputSchema.parse(args));
}
```

Use one named exported handler per contract so `handlerRef` verification is exact.

- [ ] **Step 3: Implement eight canonical bindings**

Pattern:

```ts
const headlessValidateProjectTool=defineCanonicalToolBinding('headless.validate_project',{
  inputSchema:HeadlessValidateProjectSchema,
  handler:validateHeadlessProject
});
```

Repeat explicitly for all eight and call `bindCanonicalTool(registrar,binding,manager)`.

- [ ] **Step 4: Add exact contracts**

Add domain `headless`, profiles `['runtime','full']`, source `packages/server/src/mcp/register-headless-tools.ts`, exact `schemaRef`/`handlerRef`. Risk metadata:

```text
headless.status       tags=[read], dynamic=none
headless.get_output   tags=[read], dynamic=none
headless.validate_project tags=[], dynamic=none
headless.import       tags=[], dynamic=none
headless.run          tags=[], dynamic=none
headless.run_scene    tags=[], dynamic=none
headless.run_tests    tags=[], dynamic=none
headless.stop         tags=[control], dynamic=conditional
```

`headless.stop` remains dynamically risky in `ToolPolicy.assess`; `control` only grants recovery/closing availability and is not sufficient to make assessment normal after the dynamic override.

- [ ] **Step 5: Generate artifacts and verify exact counts**

```bash
npm run generate:tool-contracts
npm run check:tool-contracts
```
Expected generated inventory:

```text
Total public tools: 173
Canonical schema/handler bindings: 29
minimal 5 / core 78 / 2d 121 / 3d 107 / navigation 67 / ui 81 / runtime 38 / full 173
```

- [ ] **Step 6: Run focused catalog/contract/server tests**

```bash
npm run test --workspace @godot-mcp/server -- --run packages/server/test/headless-tools.test.ts packages/server/test/mcp-server.test.ts packages/server/test/tool-catalog.test.ts packages/server/test/tool-contract-generator.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit public tool surface**

```bash
git add packages/server/src/tools/headless-tools.ts packages/server/src/mcp/register-headless-tools.ts packages/server/src/mcp/create-server.ts scripts/tool-contracts.json packages/server/src/tooling/tool-catalog.generated.ts packages/server/src/security/tool-policy.generated.ts docs/generated/tool-inventory.md packages/server/test
git commit -m "feat(headless): expose canonical headless tools"
```

---

### Task 6: Security policy, recovery barriers, server lifecycle, and addon child isolation

**Files:**
- Modify: `packages/server/src/security/tool-policy.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/godot-addon/addons/godot_mcp/plugin.gd`
- Create: `packages/server/test/headless-addon-contract.test.ts`
- Modify: `packages/server/test/tool-policy.test.ts`
- Modify: `packages/server/test/server-lifecycle.test.ts`

**Interfaces:**
- `ToolPolicy` requires `filesystem.project + process.godot` for the six start/control operations.
- `headless.status/get_output` remain normal reads.
- `headless.stop` is recovery/closing control but always dynamically risky when an active execution exists; its fingerprint includes current `executionId`.
- `runServer()` resolves and owns one manager and closes it before session finish.

- [ ] **Step 1: Write RED policy tests**

Assert:

```ts
expect((await policy.assess('headless.status',{})).risk).toBe('normal');
expect((await policy.assess('headless.get_output',{})).risk).toBe('normal');
for(const name of ['headless.validate_project','headless.import','headless.run','headless.run_scene','headless.run_tests','headless.stop'])
  expect((await policy.assess(name,argsFor(name))).risk).toBe('risky');
```

Verify starting/control permissions include exactly `filesystem.project` and `process.godot` as relevant, and not `process.shell/process.external/network.external`. Disable `process.godot` and prove execution is blocked before manager operation.

- [ ] **Step 2: Write RED recovery and stop-fingerprint tests**

With an open transaction/recovery barrier:
- `headless.run*`, `validate_project`, `import`, `run_tests` => barrier/transaction error;
- `headless.status/get_output/stop` remain callable.

Mock manager status so active execution changes from UUID A to UUID B between assessments and assert `headless.stop` fingerprints differ. Add display target `execution:<uuid>`.

- [ ] **Step 3: Implement policy integration**

Add headless path keys `scene_path`/`script_path` only for corresponding tool names. Add explicit project target `res://project.godot` for validate/import/run. For `headless.stop`, query the manager through a small `headlessStatus` dependency passed into policy or an injected resolver function; do not read PID as identity. Put active `executionId` into `extra` and display targets.

Mark `headless.status/get_output` as generated reads, and `headless.stop` as generated control. Extend the existing exemption logic so those three can execute during barriers. Keep dynamic override:

```ts
if(name==='headless.stop' || ['headless.validate_project','headless.import','headless.run','headless.run_scene','headless.run_tests'].includes(name)) risk='risky';
```

- [ ] **Step 4: Write RED addon contract test**

Read `plugin.gd` and assert `_enter_tree()` checks `OS.get_environment("GODOT_MCP_HEADLESS_CHILD") == "1"` before debugger/bridge setup and returns without constructing either.

- [ ] **Step 5: Implement addon marker**

At the start of `_enter_tree()`:

```gdscript
if OS.get_environment("GODOT_MCP_HEADLESS_CHILD") == "1":
    return
```

Make `_exit_tree()` null-safe for both `_bridge` and `_debugger` so marked children exit without side effects.

- [ ] **Step 6: Integrate manager into server startup/shutdown**

Resolve:

```ts
const godotBin=config.godotBin ?? (process.env.GODOT_BIN?.trim() || null);
const headless=new HeadlessProcessManager(session,sessions,{godotBin});
```

Pass `headless` to `ToolPolicy` if needed for dynamic stop assessment and to `createMcpServer`. Insert `() => headless.close()` in shutdown before `sessions.finish(...)`. Do not make bridge startup conditional on headless availability; editor tools remain available exactly as before.

- [ ] **Step 7: Run focused security/lifecycle/addon tests**

```bash
npm run test --workspace @godot-mcp/server -- --run packages/server/test/tool-policy.test.ts packages/server/test/server-lifecycle.test.ts packages/server/test/headless-addon-contract.test.ts
```
Expected: PASS.

- [ ] **Step 8: Commit security/lifecycle integration**

```bash
git add packages/server/src/security/tool-policy.ts packages/server/src/index.ts packages/godot-addon/addons/godot_mcp/plugin.gd packages/server/test/tool-policy.test.ts packages/server/test/server-lifecycle.test.ts packages/server/test/headless-addon-contract.test.ts
git commit -m "feat(headless): enforce owned process lifecycle"
```

---

### Task 7: Real Godot 4.6.3 headless integration suite

**Files:**
- Create: `tests/integration/headless-process-manager.test.ts`
- Create: `tests/integration/helpers/headless-test-runner.gd`
- Create: `tests/integration/helpers/headless-persistent.gd`
- Modify: `scripts/run-integration.mjs`
- Modify: `packages/server/test/integration-scripts.test.ts`

**Interfaces:**
- Integration suite launches MCP server against a disposable project with **no graphical Godot editor process required**.
- Fixture `headless-test-runner.gd` prints `HEADLESS_TEST_RUNNER_OK` and exits with a known code chosen by the test contract.
- Persistent fixture prints `HEADLESS_PERSISTENT_READY` and remains alive until stopped.

- [ ] **Step 1: Write integration test first**

Test sequence:
1. create disposable project with installed addon and fixture scripts/scenes;
2. start MCP server with `GODOT_BIN` pointing to authoritative executable;
3. verify `session.status.editorConnected === false`;
4. approve `headless.validate_project`; assert exit 0;
5. approve `headless.import`; assert exit 0;
6. approve `headless.run_tests` on `res://tests/headless-test-runner.gd`; assert known output and exit;
7. approve `headless.run`; assert running/status/output;
8. while running, second start => `HEADLESS_BUSY`;
9. approve `headless.stop`; assert no active execution;
10. approve `headless.run_scene`; assert running then stop;
11. prove no child authenticated the editor bridge during validate/import by keeping `editorConnected === false` throughout.

- [ ] **Step 2: Run integration test and verify RED**

Windows authoritative command:

```powershell
$env:GODOT_BIN='C:\Tools\Godot\Godot_v4.6.3-stable_win64.exe'
npm run build
npm run test:integration -- --headless
```
Expected: FAIL until runner wiring/fixtures are implemented.

- [ ] **Step 3: Implement deterministic Godot fixtures**

`headless-test-runner.gd`:

```gdscript
extends SceneTree
func _initialize() -> void:
    print("HEADLESS_TEST_RUNNER_OK")
    quit(7)
```

The integration assertion must expect `exitCode === 7` as a normal completed result, proving nonzero test exit is not converted into MCP transport failure.

Persistent fixture scene/script prints exactly one readiness marker and uses a timer/process loop so it remains alive until manager stop.

- [ ] **Step 4: Wire `scripts/run-integration.mjs`**

Add a `--headless` selection that includes `tests/integration/headless-process-manager.test.ts` and does not require `GODOT_RUNTIME_INTEGRATION=1` or a pre-opened editor. Preserve existing standard/runtime/visual selection behavior.

- [ ] **Step 5: Run integration suite and verify GREEN**

```powershell
$env:GODOT_BIN='C:\Tools\Godot\Godot_v4.6.3-stable_win64.exe'
npm run build
node .\scripts\run-integration.mjs --headless
```
Expected: Phase 8 integration PASS with `editorConnected=false`, exact output marker, `HEADLESS_BUSY`, stop, and no surviving active child.

- [ ] **Step 6: Commit integration suite**

```bash
git add tests/integration/headless-process-manager.test.ts tests/integration/helpers/headless-test-runner.gd tests/integration/helpers/headless-persistent.gd scripts/run-integration.mjs packages/server/test/integration-scripts.test.ts
git commit -m "test(headless): verify real Godot process lifecycle"
```

---

### Task 8: Full regression gates, documentation, and transport verification

**Files:**
- Modify: `README.md` and relevant package README only if current docs enumerate execution modes/tool profiles.
- No production code changes unless a full-gate failure identifies a real Phase 8 regression; any such fix gets its own RED test and commit.

**Interfaces:**
- Produces final Phase 8 implementation tree and reproducible incremental patch/full bundle from exact spec baseline.

- [ ] **Step 1: Run generated-contract and static gates**

```powershell
npm run check:tool-contracts
npm run build
npm run typecheck
npm test
npm run check:godot
```
Expected: all GREEN; generated count 173.

- [ ] **Step 2: Run authoritative Windows integration gates**

```powershell
$env:GODOT_BIN='C:\Tools\Godot\Godot_v4.6.3-stable_win64.exe'
npm run test:integration
node .\scripts\run-integration.mjs --headless
$env:GODOT_RUNTIME_INTEGRATION='1'
npm run test:integration:runtime
npm run test:integration:visual
```
Expected: all pre-existing suites GREEN plus Phase 8 headless GREEN. Treat known intentional Godot log noise by actual Vitest assertion/exception status, not stderr text alone.

- [ ] **Step 3: Verify exact public counts and canonical binding totals**

Run a focused test or script that asserts:

```text
173 total
29 canonical
144 legacy
minimal 5
core 78
2d 121
3d 107
navigation 67
ui 81
runtime 38
full 173
```

- [ ] **Step 4: Verify clean shutdown leaves no owned child**

After integration, inspect `headless.status` before MCP shutdown (`active=null`) and verify no Phase 8 fixture Godot child owned by the test remains. Do not kill unrelated Godot processes as part of verification.

- [ ] **Step 5: Update docs from verified behavior only**

Document the eight tools, Godot-only process boundary, `res://` restrictions, one-child limit, approval requirement, no-editor operation, and Antigravity elicitation limitation only where external-client docs already discuss hosts. Do not claim debugger/readiness semantics.

- [ ] **Step 6: Commit verified docs**

```bash
git add README.md packages/*/README.md docs/generated/tool-inventory.md
git commit -m "docs: document true headless execution"
```

- [ ] **Step 7: Build incremental patch and full bundle**

From the exact spec-parent baseline, generate:

```bash
git format-patch --stdout 80edb896c5d64c39b7f741b2af966c514b792e4f..HEAD > /mnt/data/godot-mcp-headless-process-manager-phase8-incremental.patch
git bundle create /mnt/data/godot-mcp-headless-process-manager-phase8.bundle 80edb896c5d64c39b7f741b2af966c514b792e4f..HEAD
```

If a full transport bundle must include the parent history for standalone clone/fetch, create it from the Phase 7.1 transport baseline ref rather than silently changing the incremental patch base.

- [ ] **Step 8: Simulate transport and compare tree hashes**

Create a clean temp clone from the exact Phase 7.1 bundle/spec baseline, apply the incremental patch with `git am --keep-cr`, then compare:

```bash
git rev-parse HEAD^{tree}
```

Expected: simulated tree hash equals implementation tree hash byte-for-byte. Commit hashes may differ after transport metadata; tree equality is authoritative.

- [ ] **Step 9: Final verification report**

Report exact HEAD, tree hash, per-gate results, 173/29/144 counts, profile counts, integration evidence, patch/bundle SHA-256, and transport tree equality. Do not mark Phase 8 CLOSED GREEN until the user's authoritative Windows gates and requested external-client smoke are confirmed.
