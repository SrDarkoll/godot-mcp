# Godot MCP Autonomous Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic `workflow.snapshot`, `workflow.run_check`, and `workflow.diff_since` tools that compose the existing runtime, diagnostics, visual, session, and editor primitives into a low-call-count autonomous verification loop.

**Architecture:** Add protocol schemas for workflow inputs/results, a project-scoped `WorkflowStore` for immutable baseline artifacts, and a `WorkflowService` that composes `RuntimeService`, `VisualTools`, `SessionStore`, and editor RPC without bypassing their safety boundaries. Register the workflow tools through the existing guarded registrar so permissions, audit, ownership, and session lifecycle remain centralized.

**Tech Stack:** Node.js >=22, TypeScript, MCP TypeScript SDK v2, Zod v4, Vitest, GDScript/Godot 4.6.3 integration fixtures.

**Spec:** `docs/superpowers/specs/2026-09-05-godot-mcp-autonomous-verification-design.md`

## Global Constraints

- Godot 4.x only; Windows remains the v1 integration target.
- One active project/runtime instance at a time.
- No model/LLM logic inside the MCP server.
- No arbitrary eval, shell, GDScript execution string, or permission bypass.
- Runtime ownership rules remain authoritative; external/manual runs are never stopped or replaced.
- All workflow artifacts remain under the current session directory and are never auto-deleted.
- Requested screenshots continue through `VisualTools`/`ScreenshotStore`; diagnostics continue through `DiagnosticStore`.
- Public existing tool names and semantics remain backward compatible.

---

### Task 1: Define workflow protocol and immutable artifact store

**Files:**
- Create: `packages/protocol/src/workflow.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/protocol/test/workflow.test.ts`
- Create: `packages/server/src/workflow/workflow-store.ts`
- Create: `packages/server/test/workflow-store.test.ts`

**Interfaces:**
- Produces `WorkflowSnapshotParamsSchema`, `WorkflowRunCheckParamsSchema`, `WorkflowDiffParamsSchema`, `WorkflowSnapshotSchema`, `WorkflowRunCheckResultSchema`, and `WorkflowDiffResultSchema`.
- Produces `WorkflowStore.save(snapshot): Promise<WorkflowSnapshot>` and `WorkflowStore.load(id): Promise<WorkflowSnapshot>`.
- Snapshot files live at `artifacts/workflow/<uuid>.json`, are create-only, and validate with `WorkflowSnapshotSchema` on read/write.

- [ ] **Step 1: Write failing protocol/store tests**

```ts
const parsed = WorkflowRunCheckParamsSchema.parse({});
expect(parsed).toMatchObject({target:'current',capture:true,checkpoint:true,settle_ms:500,diagnostic_limit:100});

const saved = await store.save(snapshot);
expect(saved.id).toMatch(/^[a-f0-9-]{36}$/);
expect(await store.load(saved.id)).toEqual(saved);
await expect(store.load('../outside' as never)).rejects.toMatchObject({code:'WORKFLOW_SNAPSHOT_NOT_FOUND'});
```

- [ ] **Step 2: Run focused tests to verify RED**

Run:
```bash
npm run test --workspace @godot-mcp/protocol -- workflow.test.ts
npm run test --workspace @godot-mcp/server -- workflow-store.test.ts
```
Expected: fail because workflow schemas/store do not exist.

- [ ] **Step 3: Implement protocol schemas and store**

The snapshot schema must contain:
```ts
{
  id: z.uuid(), sessionId: z.string(), label: z.string().min(1).max(80), createdAt: z.iso.datetime(),
  activeScene: EditorActiveSceneResultSchema.nullable(),
  runtime: RuntimeStatusSchema,
  diagnostics: z.strictObject({runId:z.uuid(),cursor:z.number().int().nonnegative(),entries:z.array(DiagnosticEntrySchema).max(200),dropped:z.number().int().nonnegative(),truncated:z.boolean()}).nullable(),
  screenshot: ScreenshotRecordSchema.nullable(),
  cursors: z.strictObject({nextScreenshotSequence:z.number().int().positive(),errors:z.number().int().nonnegative(),transactions:z.number().int().nonnegative(),checkpoints:z.number().int().nonnegative(),runtimeRuns:z.number().int().nonnegative()})
}
```

`WorkflowStore.save` must allocate `randomUUID()`, validate the full object, open with `wx`, fsync, and never overwrite. `load` accepts UUID only and rejects symlink/non-regular files.

- [ ] **Step 4: Re-run focused tests to verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/workflow.ts packages/protocol/src/index.ts packages/protocol/test/workflow.test.ts packages/server/src/workflow/workflow-store.ts packages/server/test/workflow-store.test.ts
git commit -m "feat(workflow): add snapshot protocol and store"
```

### Task 2: Implement snapshot and diff composition

**Files:**
- Modify: `packages/server/src/runtime/diagnostic-store.ts`
- Modify: `packages/server/src/runtime/runtime-service.ts`
- Create: `packages/server/src/workflow/workflow-service.ts`
- Create: `packages/server/test/workflow-service.test.ts`

**Interfaces:**
- Add `DiagnosticStore.tail(runId, limit): DiagnosticPage` returning the most recent bounded entries and the true current cursor.
- Add `RuntimeService.tailDiagnostics(limit): Promise<DiagnosticPage|null>` for the current native-diagnostics run.
- `WorkflowService.snapshot(input)` returns `{snapshot,imageData?}` and persists the baseline.
- `WorkflowService.diffSince(input)` is read-only and returns a `WorkflowDiffResult`.

- [ ] **Step 1: Write failing service tests**

```ts
const first = await workflow.snapshot({label:'before',capture:'none',viewport_index:0,checkpoint:true,diagnostic_limit:100});
manifest.screenshots.push(newScreenshot);
runtime.pushDiagnostic(errorEntry);
const delta = await workflow.diffSince({snapshot_id:first.snapshot.id,diagnostic_limit:100});
expect(delta.screenshots).toEqual([newScreenshot]);
expect(delta.diagnostics.entries).toEqual([errorEntry]);
expect(delta.activeScene.changed).toBe(false);
```

Also prove `tail()` returns the newest entries and the real cursor after more than `limit` messages.

- [ ] **Step 2: Run focused tests and verify RED**

- [ ] **Step 3: Implement `tailDiagnostics`, snapshot composition, and delta logic**

`WorkflowService.snapshot` must:
1. call `runtime.status()`;
2. call editor `get_active_scene` only when bridge is connected;
3. call `runtime.tailDiagnostics(limit)` only when diagnostics are supported;
4. perform the explicitly requested visual capture through `VisualTools`;
5. read the manifest after capture;
6. persist the workflow snapshot with manifest cursors.

`diffSince` must load the baseline, read current status/scene/manifest, and query diagnostics after the baseline cursor only when the same run remains active. When the run id changes, it returns bounded current-run diagnostics from cursor zero/tail and sets `runChanged:true`.

- [ ] **Step 4: Re-run focused tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/runtime/diagnostic-store.ts packages/server/src/runtime/runtime-service.ts packages/server/src/workflow/workflow-service.ts packages/server/test/workflow-service.test.ts
git commit -m "feat(workflow): add snapshot and diff service"
```

### Task 3: Add `workflow.run_check`, MCP registration, and policy integration

**Files:**
- Modify: `packages/server/src/workflow/workflow-service.ts`
- Create: `packages/server/src/mcp/register-workflow-tools.ts`
- Modify: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/src/security/tool-policy.ts`
- Create: `packages/server/test/workflow-tools.test.ts`
- Modify: `packages/server/test/mcp-server.test.ts`
- Modify: `packages/server/test/tool-policy.test.ts`

**Interfaces:**
- `WorkflowService.runCheck(input): Promise<{result:WorkflowRunCheckResult;imageData?:string}>`.
- `workflow.run_check` returns text + structured result and, when capture succeeds, an MCP `image/png` content item with the exact persisted game image.
- `workflow.snapshot` similarly returns image content only when an explicit capture was requested.
- `workflow.diff_since` returns structured text only.

- [ ] **Step 1: Write failing ownership/verdict/registration tests**

```ts
runtimeStatus = externalRunning;
await expect(workflow.runCheck(defaultInput)).rejects.toMatchObject({code:'RUNTIME_NOT_OWNED'});
expect(stopCalls).toBe(0);

runtimeStatus = sessionRunning;
const checked = await workflow.runCheck(defaultInput);
expect(stopCalls).toBe(1);
expect(startCalls).toBe(1);
expect(checked.result.verdict).toBe('pass');

runtimeDiagnostics = [nativeError];
expect((await workflow.runCheck(defaultInput)).result.verdict).toBe('fail');
```

MCP test:
```ts
const result = await client.callTool({name:'workflow.run_check',arguments:{capture:true}});
expect(result.structuredContent?.verdict).toBe('pass');
expect(result.content).toContainEqual(expect.objectContaining({type:'image',mimeType:'image/png'}));
```

- [ ] **Step 2: Run focused tests and verify RED**

- [ ] **Step 3: Implement run-check orchestration**

Rules:
```ts
const before = await runtime.status();
if (ACTIVE_STATES.has(before.state) && before.ownership === 'external') throw new BridgeRpcError('RUNTIME_NOT_OWNED', ...);
if (ACTIVE_STATES.has(before.state) && before.ownership === 'session') await runtime.stop();
const started = await runtime.run(target);
await delay(settle_ms);
const status = await runtime.status();
```

Collect diagnostics/performance/capture independently after successful start. Convert capture/performance observation errors to bounded `{code,message}` entries and `inconclusive`; do not swallow permission, ownership, invalid-request, session-closed, or artifact-integrity errors.

Verdict order:
1. native error or failed/stopped/disconnected => `fail`;
2. debugger break or observation error => `inconclusive`;
3. running/paused with no error => `pass`.

- [ ] **Step 4: Register tools and classify policy**

Add:
- `workflow.diff_since` to read-only tools;
- `workflow.snapshot` to normal project-artifact mutations;
- `workflow.run_check` to normal runtime mutations and make `required()` grant `runtime.modify`, `process.godot`, and `filesystem.project`.

- [ ] **Step 5: Re-run focused tests/full Node suite and verify GREEN**

Run:
```bash
npm run build
npm run typecheck
npm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/workflow/workflow-service.ts packages/server/src/mcp/register-workflow-tools.ts packages/server/src/mcp/create-server.ts packages/server/src/security/tool-policy.ts packages/server/test/workflow-tools.test.ts packages/server/test/mcp-server.test.ts packages/server/test/tool-policy.test.ts
git commit -m "feat(workflow): add autonomous run check tools"
```

### Task 4: Real-Godot end-to-end verification and documentation

**Files:**
- Create: `tests/integration/workflow-run-check.test.ts`
- Modify: `scripts/run-integration.mjs`
- Create: `docs/tools/workflow.md`
- Modify: `README.md`

**Interfaces:**
- Runtime integration mode includes the new workflow test when `GODOT_RUNTIME_INTEGRATION=1`.
- Test uses the existing runtime fixture/harness rather than creating a second transport or process-control path.

- [ ] **Step 1: Write the E2E test**

The test must assert:
```ts
const checked = await client.callTool({name:'workflow.run_check',arguments:{target:'current',capture:true,settle_ms:500}});
expect(checked.structuredContent).toMatchObject({verdict:'pass',snapshot:{id:expect.any(String)}});
expect(checked.content).toContainEqual(expect.objectContaining({type:'image',mimeType:'image/png'}));

const delta = await client.callTool({name:'workflow.diff_since',arguments:{snapshot_id:checked.structuredContent!.snapshot.id}});
expect(delta.structuredContent).toHaveProperty('runtime');
```

Then launch the existing native-error fixture/behavior and assert `verdict:'fail'` while evidence remains in session artifacts. Also reproduce an external/manual run and prove `workflow.run_check` returns `RUNTIME_NOT_OWNED` without stopping it.

- [ ] **Step 2: Run Node gates**

```bash
npm run build
npm run typecheck
npm test
```
Expected: all green.

- [ ] **Step 3: Run real Godot gates on Windows**

```powershell
$env:GODOT_BIN="C:\Users\ramir\Desktop\Godot_v4.6.3-stable_win64.exe"
npm run check:godot
npm run test:integration
$env:GODOT_RUNTIME_INTEGRATION="1"
npm run test:integration:runtime
$env:GODOT_VISUAL_INTEGRATION="1"
npm run test:integration:visual
```
Expected: existing gates remain green plus the new workflow E2E.

- [ ] **Step 4: Document agent usage**

`docs/tools/workflow.md` must show the recommended loop:
```text
edit -> workflow.run_check -> inspect verdict/image/diagnostics -> edit -> workflow.run_check -> workflow.diff_since
```
and explicitly state that `run_check` never replaces an external/manual game and never applies fixes itself.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/workflow-run-check.test.ts scripts/run-integration.mjs docs/tools/workflow.md README.md
git commit -m "test(workflow): verify autonomous loop in Godot"
```

## Final Verification

- `git diff --check`
- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run check:godot`
- `npm run test:integration`
- runtime integration suite with `GODOT_RUNTIME_INTEGRATION=1`
- visual integration suite with `GODOT_VISUAL_INTEGRATION=1`
- no new hard-coded user paths outside documentation command examples;
- no workflow artifact path accepts caller-controlled filesystem segments;
- no external/manual runtime is ever stopped by a workflow tool.
