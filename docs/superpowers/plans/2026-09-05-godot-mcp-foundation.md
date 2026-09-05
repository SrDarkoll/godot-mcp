# Godot MCP Foundation & Editor Handshake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working vertical slice of Godot MCP: a standard MCP stdio server can bind one Godot project, persist a session, accept one localhost Godot EditorPlugin connection, and expose `session.status`, `project.info`, and `scene.get_tree` end-to-end.

**Architecture:** The repository is an npm-workspaces monorepo. `@godot-mcp/server` owns MCP stdio, project/session state, and a loopback-only WebSocket bridge. `@godot-mcp/protocol` owns all shared structured message schemas and TypeScript types. `@godot-mcp/cli` installs the per-project GDScript addon and creates local configuration. The addon connects outward to the Node bridge, authenticates with an ephemeral descriptor under `.godot-mcp/runtime/`, and dispatches structured RPC handlers against `EditorInterface`.

**Tech Stack:** Node.js 22+ (Node.js 24 LTS recommended), npm workspaces, TypeScript (ESM), Vitest, Zod v4, `@modelcontextprotocol/server` v2 line, `ws`, Godot 4.x GDScript EditorPlugin.

**Spec:** `docs/superpowers/specs/2026-09-05-godot-mcp-design.md`

## Global Constraints

- Initial platform: Windows.
- Godot target: Godot 4.x.
- MCP server: Node.js / TypeScript.
- Godot integration: GDScript EditorPlugin + runtime debugger bridge.
- License: MIT.
- Primary tested client: Codex.
- One active Godot project/instance at a time.
- Standard MCP transport toward the client, initially stdio.
- Node-to-editor transport is WebSocket bound only to `127.0.0.1`.
- No mouse/keyboard simulation.
- No unrestricted arbitrary GDScript execution RPC.
- Project-scoped filesystem access is the default.
- Project-local `.godot-mcp/sessions/` persists locally and is ignored by Git.
- This plan implements only the foundation/editor-handshake vertical slice. Runtime/debug screenshots, full mutations, transactions/checkpoints, and release hardening are separate plans.

## Current implementation baseline

At planning time (2026-09-05), MCP TypeScript SDK v2 is the stable line for the 2026-07-28 MCP spec and provides `serveStdio`; Node.js 24 is the current LTS line while Node.js 22 is also supported LTS; Godot 4.7.2 is the latest stable Godot release. The implementation must not hardcode 4.7-only behavior: the addon advertises its Godot version and protocol capabilities so later plans can add compatibility shims.

## Plan series

This approved spec spans several independent subsystems, so implementation is intentionally split into five reviewable plans:

1. **Foundation & Editor Handshake** — this document.
2. **Editor Mutation Surface** — scene/node/script/resource operations plus Undo/Redo.
3. **Runtime, Debugger & Visual Capture** — running-game bridge, logs, metrics, editor/game screenshots.
4. **Transactions, Risk & Recovery** — risk policy, permission elevation, snapshots, rollback, checkpoints, locking.
5. **CLI Hardening, CI & Open-Source Release** — Codex setup, complete doctor/status flows, Windows CI, docs/examples/release packaging.

---

## File map locked by this plan

```text
package.json                              npm workspace root and top-level scripts
package-lock.json                         reproducible dependency lock
.gitignore                                ignores build output and local Godot MCP session state
LICENSE                                   MIT license
README.md                                 foundation quick start/status only

tsconfig.base.json                       strict shared TypeScript compiler settings

packages/protocol/package.json            protocol package metadata/exports
packages/protocol/tsconfig.json           protocol build config
packages/protocol/src/index.ts            public protocol exports
packages/protocol/src/version.ts          protocol/addon/server version constants
packages/protocol/src/rpc.ts              request/response/envelope schemas
packages/protocol/src/capabilities.ts     addon capability negotiation schema
packages/protocol/src/errors.ts           stable bridge error codes/types
packages/protocol/src/tools.ts            typed result contracts for first three tools
packages/protocol/test/rpc.test.ts         protocol schema tests
packages/protocol/test/capabilities.test.ts capability schema tests

packages/server/package.json              MCP server package metadata
packages/server/tsconfig.json             server build config
packages/server/src/index.ts              executable entrypoint
packages/server/src/mcp/create-server.ts  constructs and registers MCP tools
packages/server/src/mcp/tool-result.ts     structured MCP success/error formatting
packages/server/src/project/project-root.ts canonical project discovery/scope validation
packages/server/src/session/session.ts     in-memory session state
packages/server/src/session/session-store.ts persistent session directory/manifest creation
packages/server/src/session/bridge-descriptor.ts ephemeral bridge descriptor writer/remover
packages/server/src/bridge/bridge-server.ts loopback WebSocket lifecycle
packages/server/src/bridge/bridge-client.ts authenticated addon connection state
packages/server/src/bridge/rpc-router.ts    request correlation/timeouts to addon
packages/server/src/tools/session-status.ts `session.status`
packages/server/src/tools/project-info.ts   `project.info`
packages/server/src/tools/scene-tree.ts     `scene.get_tree`
packages/server/test/project-root.test.ts
packages/server/test/session-store.test.ts
packages/server/test/bridge-server.test.ts
packages/server/test/mcp-server.test.ts

packages/cli/package.json                 CLI package metadata/bin
packages/cli/tsconfig.json                CLI build config
packages/cli/src/index.ts                 CLI command dispatcher
packages/cli/src/init/init-project.ts      addon/config/runtime directory installer
packages/cli/src/init/enable-plugin.ts     invokes Godot EditorScript to enable addon
packages/cli/src/doctor/doctor.ts          foundation environment/project checks
packages/cli/test/init-project.test.ts
packages/cli/test/doctor.test.ts

packages/godot-addon/package.json         npm package wrapper for addon template
packages/godot-addon/addons/godot_mcp/plugin.cfg
packages/godot-addon/addons/godot_mcp/plugin.gd
packages/godot-addon/addons/godot_mcp/bridge/bridge_client.gd
packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd
packages/godot-addon/addons/godot_mcp/bridge/handlers/project_info.gd
packages/godot-addon/addons/godot_mcp/bridge/handlers/scene_tree.gd
packages/godot-addon/addons/godot_mcp/tools/enable_plugin.gd

fixtures/empty-project/project.godot      minimal integration project
fixtures/empty-project/main.tscn          deterministic sample scene tree

tests/integration/editor-handshake.test.ts Node↔Godot real-editor vertical slice
scripts/run-integration.mjs               Godot-aware test launcher
```

---

### Task 1: Establish the monorepo and deterministic TypeScript test/build baseline

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/godot-addon/package.json`
- Create: `packages/protocol/src/version.ts`
- Create: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/version.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: workspace packages `@godot-mcp/protocol`, `@godot-mcp/server`, `@godot-mcp/cli`, `@godot-mcp/godot-addon`; exported constants `PROTOCOL_VERSION`, `SERVER_VERSION`, `ADDON_VERSION`.

- [ ] **Step 1: Write the failing version/export test**

```ts
// packages/protocol/test/version.test.ts
import { describe, expect, it } from 'vitest';
import { ADDON_VERSION, PROTOCOL_VERSION, SERVER_VERSION } from '../src/index.js';

describe('protocol version exports', () => {
  it('exports stable foundation versions', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(SERVER_VERSION).toBe('0.1.0');
    expect(ADDON_VERSION).toBe('0.1.0');
  });
});
```

- [ ] **Step 2: Create the workspace manifests and run the test to verify it fails**

Root `package.json`:

```json
{
  "name": "godot-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "npm run build --workspace @godot-mcp/protocol && npm run build --workspace @godot-mcp/server && npm run build --workspace @godot-mcp/cli",
    "test": "npm run build && npm run test --workspace @godot-mcp/protocol && npm run test --workspace @godot-mcp/server && npm run test --workspace @godot-mcp/cli",
    "typecheck": "npm run build && npm run typecheck --workspace @godot-mcp/protocol && npm run typecheck --workspace @godot-mcp/server && npm run typecheck --workspace @godot-mcp/cli",
    "test:integration": "node scripts/run-integration.mjs"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^6.0.0",
    "vitest": "^4.0.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

Use these exact foundation package identities:

```json
// packages/protocol/package.json
{
  "name": "@godot-mcp/protocol",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": { "zod": "^4.0.0" }
}
```

```json
// packages/server/package.json (dependencies are expanded in Tasks 4-5)
{
  "name": "@godot-mcp/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": { "godot-mcp-server": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": { "@godot-mcp/protocol": "0.1.0" }
}
```

```json
// packages/cli/package.json
{
  "name": "@godot-mcp/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": { "godot-mcp": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@godot-mcp/protocol": "0.1.0",
    "@godot-mcp/server": "0.1.0",
    "@godot-mcp/godot-addon": "0.1.0"
  }
}
```

```json
// packages/godot-addon/package.json
{
  "name": "@godot-mcp/godot-addon",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "files": ["addons/godot_mcp"]
}
```

Add `@types/node` to root devDependencies and use this `tsconfig.json` shape for protocol/server/cli (change only `rootDir` if a package later needs generated sources):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Run:

```bash
npm install
npm exec --workspace @godot-mcp/protocol -- vitest run test/version.test.ts
```

Expected: FAIL because `src/index.ts` does not yet export the constants.

- [ ] **Step 3: Add minimal compilable package entrypoints and implement version constants**

Create these compile-only entrypoints; later tasks replace them with real executables:

```ts
// packages/server/src/index.ts
export {};
```

```ts
// packages/cli/src/index.ts
export {};
```

```ts
// packages/protocol/src/version.ts
export const PROTOCOL_VERSION = 1 as const;
export const SERVER_VERSION = '0.1.0' as const;
export const ADDON_VERSION = '0.1.0' as const;
```

```ts
// packages/protocol/src/index.ts
export * from './version.js';
```

`.gitignore` must include exactly these local/generated roots at this stage:

```gitignore
node_modules/
dist/
coverage/
*.tsbuildinfo
.godot/
.godot-mcp/runtime/
.godot-mcp/sessions/
```

Add the standard MIT license text with copyright line:

```text
Copyright (c) 2026 Godot MCP contributors
```

- [ ] **Step 4: Verify workspace build, test, and typecheck**

Run:

```bash
npm run build
npm run typecheck
npm test
```

Expected: all commands exit 0; version test PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore LICENSE packages
git commit -m "chore: bootstrap godot mcp monorepo"
```

---

### Task 2: Define the structured Node↔Godot protocol and first tool contracts

**Files:**
- Create: `packages/protocol/src/rpc.ts`
- Create: `packages/protocol/src/capabilities.ts`
- Create: `packages/protocol/src/errors.ts`
- Create: `packages/protocol/src/tools.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/rpc.test.ts`
- Test: `packages/protocol/test/capabilities.test.ts`

**Interfaces:**
- Consumes: `PROTOCOL_VERSION`, `SERVER_VERSION`, `ADDON_VERSION`.
- Produces: `RpcRequest`, `RpcSuccess`, `RpcFailure`, `RpcResponse`, `AddonHello`, `AddonCapabilities`, `BridgeErrorCode`, `SessionStatusResult`, `ProjectInfoResult`, `SceneTreeResult`, and Zod schemas with the same names suffixed `Schema` where runtime validation is required.

- [ ] **Step 1: Write failing request/response schema tests**

```ts
// packages/protocol/test/rpc.test.ts
import { describe, expect, it } from 'vitest';
import { RpcRequestSchema, RpcResponseSchema } from '../src/index.js';

describe('RPC protocol', () => {
  it('accepts a structured request', () => {
    expect(RpcRequestSchema.parse({
      id: 'req-1',
      protocol: 1,
      method: 'project.info',
      params: {}
    })).toMatchObject({ id: 'req-1', method: 'project.info' });
  });

  it('rejects executable-string envelopes', () => {
    expect(() => RpcRequestSchema.parse({ exec: 'queue_free()' })).toThrow();
  });

  it('accepts structured failures', () => {
    expect(RpcResponseSchema.parse({
      id: 'req-2',
      ok: false,
      error: { code: 'METHOD_NOT_FOUND', message: 'unknown method' }
    }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing capability-negotiation tests**

```ts
// packages/protocol/test/capabilities.test.ts
import { describe, expect, it } from 'vitest';
import { AddonHelloSchema } from '../src/index.js';

describe('addon hello', () => {
  it('requires project identity and capability flags', () => {
    const hello = AddonHelloSchema.parse({
      type: 'hello',
      token: '0123456789abcdef0123456789abcdef',
      protocol: 1,
      addonVersion: '0.1.0',
      godotVersion: '4.7.2.stable.official',
      projectRoot: 'C:/Games/Test',
      capabilities: {
        editor: true,
        runtime: false,
        debugger: false,
        viewport2d: true,
        viewport3d: true,
        undoRedo: true
      }
    });
    expect(hello.capabilities.editor).toBe(true);
  });
});
```

- [ ] **Step 3: Run protocol tests to verify failure**

Run:

```bash
npm test --workspace @godot-mcp/protocol
```

Expected: FAIL with missing schema exports.

- [ ] **Step 4: Implement the canonical schemas and result types**

```ts
// packages/protocol/src/errors.ts
import { z } from 'zod/v4';

export const BridgeErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'PROTOCOL_MISMATCH',
  'AUTH_FAILED',
  'PROJECT_MISMATCH',
  'METHOD_NOT_FOUND',
  'EDITOR_NOT_CONNECTED',
  'TIMEOUT',
  'INTERNAL_ERROR'
]);
export type BridgeErrorCode = z.infer<typeof BridgeErrorCodeSchema>;
```

```ts
// packages/protocol/src/rpc.ts
import { z } from 'zod/v4';
import { BridgeErrorCodeSchema } from './errors.js';

export const RpcRequestSchema = z.object({
  id: z.string().min(1),
  protocol: z.literal(1),
  method: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  params: z.record(z.string(), z.unknown()).default({})
});

export const RpcSuccessSchema = z.object({
  id: z.string().min(1),
  ok: z.literal(true),
  result: z.unknown()
});

export const RpcFailureSchema = z.object({
  id: z.string().min(1),
  ok: z.literal(false),
  error: z.object({
    code: BridgeErrorCodeSchema,
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional()
  })
});

export const RpcResponseSchema = z.discriminatedUnion('ok', [
  RpcSuccessSchema,
  RpcFailureSchema
]);

export type RpcRequest = z.infer<typeof RpcRequestSchema>;
export type RpcResponse = z.infer<typeof RpcResponseSchema>;
```

```ts
// packages/protocol/src/capabilities.ts
import { z } from 'zod/v4';

export const AddonCapabilitiesSchema = z.object({
  editor: z.boolean(),
  runtime: z.boolean(),
  debugger: z.boolean(),
  viewport2d: z.boolean(),
  viewport3d: z.boolean(),
  undoRedo: z.boolean()
});

export const AddonHelloSchema = z.object({
  type: z.literal('hello'),
  token: z.string().min(32),
  protocol: z.literal(1),
  addonVersion: z.string().min(1),
  godotVersion: z.string().min(1),
  projectRoot: z.string().min(1),
  capabilities: AddonCapabilitiesSchema
});

export type AddonCapabilities = z.infer<typeof AddonCapabilitiesSchema>;
export type AddonHello = z.infer<typeof AddonHelloSchema>;
```

```ts
// packages/protocol/src/tools.ts
export interface SessionStatusResult {
  sessionId: string;
  projectRoot: string;
  editorConnected: boolean;
  runtimeConnected: boolean;
  godotVersion: string | null;
  addonVersion: string | null;
  protocolVersion: 1;
}

export interface ProjectInfoResult {
  name: string;
  projectRoot: string;
  projectFile: string;
  godotVersion: string;
  activeScene: string | null;
}

export interface SceneTreeNode {
  name: string;
  type: string;
  path: string;
  script: string | null;
  children: SceneTreeNode[];
}

export interface SceneTreeResult {
  scenePath: string | null;
  root: SceneTreeNode | null;
}
```

Export all four modules from `src/index.ts`.

- [ ] **Step 5: Run protocol tests and typecheck**

Run:

```bash
npm test --workspace @godot-mcp/protocol
npm run typecheck --workspace @godot-mcp/protocol
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): define bridge rpc contracts"
```

---

### Task 3: Implement project-root discovery, scope validation, and persistent session creation

**Files:**
- Create: `packages/server/src/project/project-root.ts`
- Create: `packages/server/src/session/session.ts`
- Create: `packages/server/src/session/session-store.ts`
- Create: `packages/server/src/session/bridge-descriptor.ts`
- Test: `packages/server/test/project-root.test.ts`
- Test: `packages/server/test/session-store.test.ts`

**Interfaces:**
- Consumes: protocol version constants.
- Produces: `resolveProjectRoot(input?: string): Promise<string>`, `assertProjectPath(projectRoot: string, target: string): string`, `createSession(projectRoot: string): Session`, `SessionStore.create(session): Promise<void>`, `BridgeDescriptorStore.write({port, token, sessionId}): Promise<void>`, `BridgeDescriptorStore.remove(): Promise<void>`.

- [ ] **Step 1: Write failing project-root/scope tests**

```ts
// packages/server/test/project-root.test.ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertProjectPath, resolveProjectRoot } from '../src/project/project-root.js';

describe('project root', () => {
  it('walks upward to project.godot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'godot-mcp-'));
    await writeFile(path.join(root, 'project.godot'), '[application]\nconfig/name="Fixture"\n');
    const nested = path.join(root, 'scenes', 'levels');
    await import('node:fs/promises').then(fs => fs.mkdir(nested, { recursive: true }));
    expect(await resolveProjectRoot(nested)).toBe(await import('node:fs/promises').then(fs => fs.realpath(root)));
  });

  it('rejects a path that escapes project scope', () => {
    expect(() => assertProjectPath('C:\\Games\\Test', 'C:\\Windows\\System32')).toThrow(/outside project/i);
  });
});
```

- [ ] **Step 2: Write failing session persistence tests**

```ts
// packages/server/test/session-store.test.ts
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSession } from '../src/session/session.js';
import { SessionStore } from '../src/session/session-store.js';

describe('session store', () => {
  it('creates persistent session folders and manifest', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'godot-mcp-'));
    const session = createSession(root);
    await new SessionStore(root).create(session);
    const dir = path.join(root, '.godot-mcp', 'sessions', session.id);
    await expect(stat(path.join(dir, 'screenshots', 'editor'))).resolves.toBeDefined();
    await expect(stat(path.join(dir, 'screenshots', 'game'))).resolves.toBeDefined();
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    expect(manifest.sessionId).toBe(session.id);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
npm exec --workspace @godot-mcp/server -- vitest run test/project-root.test.ts test/session-store.test.ts
```

Expected: FAIL with missing modules.

- [ ] **Step 4: Implement canonical project handling**

`resolveProjectRoot()` must:
1. resolve/realpath the starting path;
2. if starting path is a file, start at its directory;
3. walk parents until `project.godot` exists;
4. throw `No Godot project found from <path>` at filesystem root.

`assertProjectPath()` must use `path.resolve` plus `path.relative` and reject any relative value equal to `..`, starting with `..${path.sep}`, or absolute after normalization.

Core implementation shape:

```ts
export function assertProjectPath(projectRoot: string, target: string): string {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(target);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Target is outside project scope: ${resolved}`);
  }
  return resolved;
}
```

- [ ] **Step 5: Implement session state and persistent layout**

```ts
// packages/server/src/session/session.ts
import { randomUUID } from 'node:crypto';

export interface Session {
  id: string;
  projectRoot: string;
  startedAt: string;
  editorConnected: boolean;
  runtimeConnected: boolean;
  godotVersion: string | null;
  addonVersion: string | null;
  protocolVersion: 1;
}

export function createSession(projectRoot: string): Session {
  return {
    id: `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`,
    projectRoot,
    startedAt: new Date().toISOString(),
    editorConnected: false,
    runtimeConnected: false,
    godotVersion: null,
    addonVersion: null,
    protocolVersion: 1
  };
}
```

`SessionStore.create()` must create:

```text
screenshots/editor
screenshots/game
screenshots/runtime
transactions
checkpoints
logs
events
artifacts
manifest.json
```

Manifest foundation shape:

```json
{
  "sessionId": "...",
  "projectRoot": "...",
  "startedAt": "...",
  "endedAt": null,
  "godotVersion": null,
  "addonVersion": null,
  "protocolVersion": 1,
  "screenshots": [],
  "transactions": [],
  "checkpoints": [],
  "errors": [],
  "permissionChanges": []
}
```

- [ ] **Step 6: Implement ephemeral bridge descriptor**

Descriptor path:

```text
<project>/.godot-mcp/runtime/bridge.json
```

Descriptor JSON:

```json
{
  "sessionId": "session-id",
  "host": "127.0.0.1",
  "port": 61337,
  "token": "64-hex-character-random-token",
  "pid": 12345,
  "protocol": 1
}
```

Generate token with `randomBytes(32).toString('hex')`. Write atomically through `bridge.json.tmp` then `rename`. `remove()` deletes only this runtime descriptor and never session artifacts.

- [ ] **Step 7: Run focused and workspace tests**

```bash
npm test --workspace @godot-mcp/server
npm run typecheck --workspace @godot-mcp/server
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/server
git commit -m "feat(server): add project scope and session persistence"
```

---

### Task 4: Build the loopback WebSocket bridge with authenticated single-addon handshake

**Files:**
- Create: `packages/server/src/bridge/bridge-client.ts`
- Create: `packages/server/src/bridge/bridge-server.ts`
- Create: `packages/server/src/bridge/rpc-router.ts`
- Test: `packages/server/test/bridge-server.test.ts`
- Modify: `packages/server/package.json`

**Interfaces:**
- Consumes: `AddonHelloSchema`, `RpcRequestSchema`, `RpcResponseSchema`, session state, descriptor token.
- Produces: `BridgeServer.start(): Promise<{port:number}>`, `BridgeServer.stop(): Promise<void>`, `BridgeServer.connected: boolean`, `RpcRouter.call(method, params, timeoutMs?): Promise<unknown>`.

- [ ] **Step 1: Add bridge dependencies and write the failing handshake test**

Add server dependencies:

```json
{
  "dependencies": {
    "@godot-mcp/protocol": "0.1.0",
    "ws": "^8.18.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0"
  }
}
```

Test:

```ts
// packages/server/test/bridge-server.test.ts
import WebSocket from 'ws';
import { describe, expect, it } from 'vitest';
import { createSession } from '../src/session/session.js';
import { BridgeServer } from '../src/bridge/bridge-server.js';

describe('BridgeServer', () => {
  it('accepts exactly one authenticated addon for the active project', async () => {
    const session = createSession('C:/Games/Test');
    const bridge = new BridgeServer({ session, token: 'a'.repeat(64), port: 0 });
    const { port } = await bridge.start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({
      type: 'hello', token: 'a'.repeat(64), protocol: 1,
      addonVersion: '0.1.0', godotVersion: '4.7.2.stable.official',
      projectRoot: 'C:/Games/Test',
      capabilities: { editor: true, runtime: false, debugger: false, viewport2d: true, viewport3d: true, undoRedo: true }
    }));
    await bridge.waitUntilConnected(1000);
    expect(bridge.connected).toBe(true);
    expect(session.godotVersion).toContain('4.7.2');
    ws.close();
    await bridge.stop();
  });
});
```

- [ ] **Step 2: Run the bridge test and verify failure**

```bash
npm install
npm exec --workspace @godot-mcp/server -- vitest run test/bridge-server.test.ts
```

Expected: FAIL because `BridgeServer` does not exist.

- [ ] **Step 3: Implement secure loopback lifecycle and handshake**

Constructor contract:

```ts
interface BridgeServerOptions {
  session: Session;
  token: string;
  port?: number; // 61337 default; 0 allowed for tests
}
```

Use:

```ts
new WebSocketServer({ host: '127.0.0.1', port: options.port ?? 61337 });
```

Before authentication, the first message must parse as `AddonHelloSchema`. Reject/close with code `1008` when:
- token mismatch;
- protocol mismatch;
- project root mismatch after `fs.realpath()` + Windows separator/case normalization;
- another authenticated addon is already connected.

On success:
- store the socket as the active `BridgeClient`;
- set `session.editorConnected = true`;
- set `session.godotVersion` and `session.addonVersion`;
- reply with `{"type":"hello_ack","protocol":1,"sessionId":"..."}`.

On socket close, clear the client and set `session.editorConnected = false`.

- [ ] **Step 4: Add failing RPC correlation/timeout tests**

```ts
it('correlates responses by request id', async () => {
  // after authenticated setup
  ws.on('message', raw => {
    const req = JSON.parse(raw.toString());
    if (req.id) ws.send(JSON.stringify({ id: req.id, ok: true, result: { name: 'Fixture' } }));
  });
  const result = await bridge.rpc.call('project.info', {});
  expect(result).toEqual({ name: 'Fixture' });
});

it('times out unanswered rpc calls', async () => {
  await expect(bridge.rpc.call('project.info', {}, 25)).rejects.toThrow(/timeout/i);
});
```

- [ ] **Step 5: Implement `RpcRouter`**

Requirements:
- request IDs are `req-${incrementingNumber}`;
- validate outbound requests with `RpcRequestSchema`;
- parse inbound results with `RpcResponseSchema`;
- maintain `Map<string, {resolve,reject,timer}>`;
- default timeout is 5000 ms;
- reject all pending calls with `EDITOR_NOT_CONNECTED` when socket closes;
- never execute arbitrary response data.

- [ ] **Step 6: Run bridge/server tests**

```bash
npm test --workspace @godot-mcp/server
npm run typecheck --workspace @godot-mcp/server
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package-lock.json packages/server
git commit -m "feat(server): add authenticated godot websocket bridge"
```

---

### Task 5: Expose the first standard MCP stdio tools

**Files:**
- Create: `packages/server/src/mcp/tool-result.ts`
- Create: `packages/server/src/tools/session-status.ts`
- Create: `packages/server/src/tools/project-info.ts`
- Create: `packages/server/src/tools/scene-tree.ts`
- Create: `packages/server/src/mcp/create-server.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/mcp-server.test.ts`
- Modify: `packages/server/package.json`

**Interfaces:**
- Consumes: `Session`, `RpcRouter`, protocol result interfaces.
- Produces: stdio MCP server with tools `session.status`, `project.info`, `scene.get_tree`; executable `godot-mcp-server`.

- [ ] **Step 1: Add MCP SDK dependency and write failing in-memory tool tests**

Server dependency:

```json
"@modelcontextprotocol/server": "^2.0.0"
```

Test business handlers directly first so MCP transport is not the unit-test boundary:

```ts
// packages/server/test/mcp-server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getSessionStatus } from '../src/tools/session-status.js';
import { getProjectInfo } from '../src/tools/project-info.js';

it('returns session status without requiring an editor connection', async () => {
  const session = {
    id: 's1', projectRoot: 'C:/Games/Test', startedAt: 'x',
    editorConnected: false, runtimeConnected: false,
    godotVersion: null, addonVersion: null, protocolVersion: 1 as const
  };
  expect(getSessionStatus(session)).toMatchObject({ sessionId: 's1', editorConnected: false });
});

it('forwards project.info to the addon', async () => {
  const rpc = { call: vi.fn().mockResolvedValue({ name: 'Fixture' }) };
  await expect(getProjectInfo(rpc as never)).resolves.toEqual({ name: 'Fixture' });
  expect(rpc.call).toHaveBeenCalledWith('project.info', {});
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm exec --workspace @godot-mcp/server -- vitest run test/mcp-server.test.ts
```

Expected: FAIL with missing handlers.

- [ ] **Step 3: Implement handler functions and common MCP result formatting**

```ts
export function getSessionStatus(session: Session): SessionStatusResult {
  return {
    sessionId: session.id,
    projectRoot: session.projectRoot,
    editorConnected: session.editorConnected,
    runtimeConnected: session.runtimeConnected,
    godotVersion: session.godotVersion,
    addonVersion: session.addonVersion,
    protocolVersion: 1
  };
}
```

```ts
export async function getProjectInfo(rpc: Pick<RpcRouter, 'call'>): Promise<ProjectInfoResult> {
  return await rpc.call('project.info', {}) as ProjectInfoResult;
}

export async function getSceneTree(rpc: Pick<RpcRouter, 'call'>): Promise<SceneTreeResult> {
  return await rpc.call('scene.get_tree', {}) as SceneTreeResult;
}
```

MCP responses return both human-readable text and `structuredContent`:

```ts
export function toolSuccess<T extends Record<string, unknown>>(value: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value
  };
}
```

- [ ] **Step 4: Register the three tools in `create-server.ts`**

Use MCP SDK v2 `McpServer` and Zod v4 empty-object schemas.

```ts
server.registerTool('session.status', {
  description: 'Return the active Godot MCP session and editor/runtime connection state.',
  inputSchema: z.object({})
}, async () => toolSuccess(getSessionStatus(ctx.session)));

server.registerTool('project.info', {
  description: 'Inspect the active Godot project through the connected editor addon.',
  inputSchema: z.object({})
}, async () => toolSuccess(await getProjectInfo(ctx.bridge.rpc)));

server.registerTool('scene.get_tree', {
  description: 'Return the active edited scene tree with node names, classes, paths, and scripts.',
  inputSchema: z.object({})
}, async () => toolSuccess(await getSceneTree(ctx.bridge.rpc)));
```

`session.status` must work while the editor is disconnected. `project.info` and `scene.get_tree` must return a structured MCP tool error when no addon is connected.

- [ ] **Step 5: Implement executable lifecycle in `src/index.ts`**

Argument contract:

```text
godot-mcp-server [--project <path>] [--bridge-port <port>]
```

Lifecycle:
1. resolve active project (argument or cwd);
2. create persistent session;
3. start loopback bridge;
4. write ephemeral descriptor with actual port/token;
5. serve MCP over stdio using SDK v2 `serveStdio`;
6. log only to stderr;
7. on SIGINT/SIGTERM, remove bridge descriptor and stop bridge.

Use `serveStdio(() => createMcpServer(context))`; do not write diagnostics to stdout because stdout is the MCP protocol channel.

- [ ] **Step 6: Add an MCP smoke test using the SDK client/in-memory transport or stdio child process**

The test must assert:
- `tools/list` contains the exact three tool names;
- `session.status` succeeds without editor;
- `project.info` reports editor disconnected rather than hanging.

- [ ] **Step 7: Run build/tests**

```bash
npm run build
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package-lock.json packages/server
git commit -m "feat(server): expose foundation mcp tools"
```

---

### Task 6: Implement the Godot 4 EditorPlugin bridge and read-only handlers

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/plugin.cfg`
- Create: `packages/godot-addon/addons/godot_mcp/plugin.gd`
- Create: `packages/godot-addon/addons/godot_mcp/bridge/bridge_client.gd`
- Create: `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/project_info.gd`
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/scene_tree.gd`
- Create: `packages/godot-addon/addons/godot_mcp/tools/enable_plugin.gd`

**Interfaces:**
- Consumes: `.godot-mcp/runtime/bridge.json`, RPC protocol v1.
- Produces: authenticated hello, `project.info` handler, `scene.get_tree` handler, protocol error responses.

- [ ] **Step 1: Create plugin metadata and a minimal plugin entrypoint that fails loudly on load errors**

```ini
; plugin.cfg
[plugin]
name="Godot MCP"
description="Structured MCP bridge for Godot 4.x"
author="Godot MCP contributors"
version="0.1.0"
script="plugin.gd"
```

```gdscript
# plugin.gd
@tool
extends EditorPlugin

var _bridge: Node

func _enter_tree() -> void:
    _bridge = preload("res://addons/godot_mcp/bridge/bridge_client.gd").new()
    add_child(_bridge)
    _bridge.start(EditorInterface)

func _exit_tree() -> void:
    if is_instance_valid(_bridge):
        _bridge.stop()
        _bridge.queue_free()
```

- [ ] **Step 2: Implement descriptor loading and WebSocket connection**

`bridge_client.gd` requirements:
- `@tool extends Node`;
- poll `res://.godot-mcp/runtime/bridge.json` once per second while disconnected;
- use `WebSocketPeer.new()` and `connect_to_url("ws://127.0.0.1:%d" % port)`;
- never connect to a non-loopback host from the descriptor in v1;
- call `socket.poll()` from `_process`;
- after open, send hello exactly once;
- reconnect after clean/abnormal close while descriptor still exists.

Hello payload:

```gdscript
var hello := {
    "type": "hello",
    "token": descriptor.token,
    "protocol": 1,
    "addonVersion": "0.1.0",
    "godotVersion": Engine.get_version_info().string,
    "projectRoot": ProjectSettings.globalize_path("res://").replace("\\", "/").trim_suffix("/"),
    "capabilities": {
        "editor": true,
        "runtime": false,
        "debugger": false,
        "viewport2d": EditorInterface.has_method("get_editor_viewport_2d"),
        "viewport3d": EditorInterface.has_method("get_editor_viewport_3d"),
        "undoRedo": true
    }
}
```

- [ ] **Step 3: Implement strict dispatcher behavior**

`rpc_dispatcher.gd` supports exactly:

```text
project.info
scene.get_tree
```

Unknown method response:

```gdscript
{
    "id": request.id,
    "ok": false,
    "error": {
        "code": "METHOD_NOT_FOUND",
        "message": "Unknown method: %s" % request.method
    }
}
```

Reject malformed requests with `INVALID_REQUEST`; never call a method supplied by the request dynamically.

- [ ] **Step 4: Implement `project.info`**

Return:

```gdscript
{
    "name": str(ProjectSettings.get_setting("application/config/name", "")),
    "projectRoot": ProjectSettings.globalize_path("res://").replace("\\", "/").trim_suffix("/"),
    "projectFile": ProjectSettings.globalize_path("res://project.godot"),
    "godotVersion": Engine.get_version_info().string,
    "activeScene": EditorInterface.get_edited_scene_root().scene_file_path if EditorInterface.get_edited_scene_root() else null
}
```

- [ ] **Step 5: Implement deterministic scene-tree serialization**

Recursive helper:

```gdscript
func serialize_node(scene_root: Node, node: Node) -> Dictionary:
    var script_path = null
    var script = node.get_script()
    if script is Script and not script.resource_path.is_empty():
        script_path = script.resource_path
    var relative := scene_root.get_path_to(node)
    var logical_path := "/%s" % scene_root.name
    if relative != NodePath("."):
        logical_path += "/%s" % str(relative)
    var children: Array = []
    for child in node.get_children():
        children.append(serialize_node(scene_root, child))
    return {
        "name": node.name,
        "type": node.get_class(),
        "path": logical_path,
        "script": script_path,
        "children": children
    }
```

Handler result:

```gdscript
var root := EditorInterface.get_edited_scene_root()
return {
    "scenePath": root.scene_file_path if root else null,
    "root": serialize_node(root, root) if root else null
}
```

- [ ] **Step 6: Add a bundled command-line GDScript used by the CLI to enable the addon**

Godot's `--script` entrypoint requires a `SceneTree`/`MainLoop` script, so this helper edits the project setting through `ProjectSettings` and exits itself:

```gdscript
extends SceneTree

const PLUGIN_PATH := "res://addons/godot_mcp/plugin.cfg"

func _init() -> void:
    var enabled := ProjectSettings.get_setting("editor_plugins/enabled", PackedStringArray()) as PackedStringArray
    if not enabled.has(PLUGIN_PATH):
        enabled.append(PLUGIN_PATH)
        ProjectSettings.set_setting("editor_plugins/enabled", enabled)
    var save_error := ProjectSettings.save()
    if save_error != OK:
        printerr("GODOT_MCP_PLUGIN_ENABLE_FAILED:%d" % save_error)
        quit(1)
        return
    print("GODOT_MCP_PLUGIN_ENABLED")
    quit(0)
```

The CLI invokes this with `--headless --path <project> --script res://addons/godot_mcp/tools/enable_plugin.gd`; the marker is parsed from process stdout/stderr by the CLI, not by MCP stdio.

- [ ] **Step 7: Perform static addon sanity checks**

Until a Godot binary is configured, verify:

```bash
find packages/godot-addon/addons/godot_mcp -type f -maxdepth 5 -print
```

Expected files match the file map. During execution, if a Godot 4.x binary is available, additionally run:

```bash
"$GODOT_BIN" --headless --editor --path fixtures/empty-project --quit-after 2
```

Expected: no parser errors mentioning `addons/godot_mcp`.

- [ ] **Step 8: Commit**

```bash
git add packages/godot-addon
git commit -m "feat(addon): add godot editor bridge and read handlers"
```

---

### Task 7: Implement `godot-mcp init` and foundation `doctor`

**Files:**
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/src/init/init-project.ts`
- Create: `packages/cli/src/init/enable-plugin.ts`
- Create: `packages/cli/src/doctor/doctor.ts`
- Test: `packages/cli/test/init-project.test.ts`
- Test: `packages/cli/test/doctor.test.ts`
- Modify: `packages/cli/package.json`

**Interfaces:**
- Consumes: addon template package, `resolveProjectRoot`, configured Godot executable.
- Produces: `godot-mcp init [path] [--godot <exe>]`, `godot-mcp doctor [path] [--godot <exe>]`.

- [ ] **Step 1: Write failing init test**

```ts
it('installs addon and local config without deleting existing project files', async () => {
  const root = await createTempGodotProject();
  await initProject({ projectRoot: root, enable: false });
  await expect(stat(path.join(root, 'addons', 'godot_mcp', 'plugin.cfg'))).resolves.toBeDefined();
  const config = JSON.parse(await readFile(path.join(root, '.godot-mcp', 'config.json'), 'utf8'));
  expect(config).toEqual({ protocol: 1, bridgePort: 61337 });
  expect(await readFile(path.join(root, 'project.godot'), 'utf8')).toContain('config/name');
});
```

- [ ] **Step 2: Write failing doctor test**

```ts
it('reports project/addon/node checks independently', async () => {
  const report = await doctor({ projectRoot: fixtureRoot, godotBin: null });
  expect(report.checks.find(c => c.id === 'node')?.ok).toBe(true);
  expect(report.checks.find(c => c.id === 'project')?.ok).toBe(true);
  expect(report.checks.find(c => c.id === 'addon')?.ok).toBe(false);
  expect(report.checks.find(c => c.id === 'godot')?.ok).toBe(false);
});
```

- [ ] **Step 3: Run CLI tests to verify failure**

```bash
npm test --workspace @godot-mcp/cli
```

Expected: FAIL with missing modules.

- [ ] **Step 4: Implement idempotent addon installation**

`initProject()` must:
1. resolve project root and require `project.godot`;
2. copy only `packages/godot-addon/addons/godot_mcp/**` to `<project>/addons/godot_mcp/`;
3. create `.godot-mcp/config.json` as:

```json
{
  "protocol": 1,
  "bridgePort": 61337
}
```

4. create `.godot-mcp/runtime/` and `.godot-mcp/sessions/`;
5. add these lines to project `.gitignore` if absent:

```gitignore
.godot-mcp/runtime/
.godot-mcp/sessions/
```

6. never delete unrelated addon files or overwrite user config keys not owned by v1 without explicit migration logic.

- [ ] **Step 5: Implement optional automatic plugin enabling**

When `enable !== false` and a Godot executable is available, spawn:

```text
<godot.exe> --headless --path <project-root> --script res://addons/godot_mcp/tools/enable_plugin.gd
```

Require exit code 0 and output marker `GODOT_MCP_PLUGIN_ENABLED`. If Godot is not available, `init` still installs files but returns a warning that the user must enable `godot_mcp` in Project Settings > Plugins.

- [ ] **Step 6: Implement foundation doctor checks**

Return structured checks:

```ts
interface DoctorCheck { id: 'node'|'project'|'addon'|'godot'|'protocol'; ok: boolean; detail: string; }
interface DoctorReport { ok: boolean; checks: DoctorCheck[]; }
```

Checks:
- Node major >= 22;
- valid `project.godot`;
- addon `plugin.cfg` and `plugin.gd` exist;
- Godot executable exists and `--version` begins with `4.`;
- `.godot-mcp/config.json` protocol equals `1` when present.

- [ ] **Step 7: Wire CLI parser without a heavy command framework**

`src/index.ts` supports only:

```text
godot-mcp init [path] [--godot <exe>]
godot-mcp doctor [path] [--godot <exe>]
```

Unknown commands exit 2 with usage on stderr. Human-readable command output goes to stdout because this CLI is not the MCP stdio process.

- [ ] **Step 8: Run CLI/workspace tests**

```bash
npm run build
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package-lock.json packages/cli
git commit -m "feat(cli): add project init and doctor"
```

---

### Task 8: Add a deterministic fixture and real editor-handshake integration test

**Files:**
- Create: `fixtures/empty-project/project.godot`
- Create: `fixtures/empty-project/main.tscn`
- Create: `tests/integration/editor-handshake.test.ts`
- Create: `scripts/run-integration.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: built CLI, server, addon, configured `GODOT_BIN`.
- Produces: repeatable end-to-end proof of `Node MCP server ↔ Godot EditorPlugin ↔ project.info/scene.get_tree`.

- [ ] **Step 1: Create the deterministic fixture**

`project.godot`:

```ini
; Engine configuration file.
config_version=5

[application]
config/name="Godot MCP Fixture"
run/main_scene="res://main.tscn"

[display]
window/size/viewport_width=640
window/size/viewport_height=360

[rendering]
renderer/rendering_method="gl_compatibility"
```

`main.tscn`:

```ini
[gd_scene format=3]

[node name="Main" type="Node2D"]

[node name="Player" type="CharacterBody2D" parent="."]

[node name="Camera2D" type="Camera2D" parent="Player"]
```

- [ ] **Step 2: Write the integration test before the launcher**

Test expectations after setup:

```ts
expect(await waitFor(() => bridge.connected, 10_000)).toBe(true);
expect(await getProjectInfo(bridge.rpc)).toMatchObject({ name: 'Godot MCP Fixture' });
expect(await getSceneTree(bridge.rpc)).toMatchObject({
  root: {
    name: 'Main',
    type: 'Node2D',
    children: [{
      name: 'Player',
      type: 'CharacterBody2D',
      children: [{ name: 'Camera2D', type: 'Camera2D' }]
    }]
  }
});
```

The test process must always terminate the spawned Godot process in `finally`.

- [ ] **Step 3: Implement `scripts/run-integration.mjs` guardrails**

Behavior:
- if `GODOT_BIN` is unset: print `SKIP integration: GODOT_BIN is not configured` and exit 0 unless `REQUIRE_GODOT_INTEGRATION=1`;
- if configured: run `godot --version` and reject non-4.x;
- invoke the integration Vitest file with `GODOT_BIN` preserved.

- [ ] **Step 4: Implement fixture preparation in the test**

Before spawning Godot:
1. copy fixture to a fresh temp directory;
2. call `initProject({ projectRoot: temp, godotBin, enable: true })`;
3. start `BridgeServer` with port `0`;
4. write the generated bridge descriptor;
5. spawn Godot:

```text
<godot> --headless --path <temp-project> --editor res://main.tscn
```

6. wait up to 10 seconds for addon hello;
7. call both read tools;
8. stop Godot and bridge;
9. verify `.godot-mcp/sessions/<id>/manifest.json` still exists.

- [ ] **Step 5: Run unit suite, then integration suite**

Without Godot configured:

```bash
npm test
npm run test:integration
```

Expected: unit PASS, integration explicitly SKIP.

With a Godot 4.x binary:

```powershell
$env:GODOT_BIN = "C:\Tools\Godot\Godot_v4.7.2-stable_win64.exe"
$env:REQUIRE_GODOT_INTEGRATION = "1"
npm run test:integration
```

Expected: PASS and tool results match the fixture.

- [ ] **Step 6: Commit**

```bash
git add fixtures tests scripts package.json
git commit -m "test: prove godot editor handshake vertical slice"
```

---

### Task 9: Document the foundation quick start and verify the full Plan 1 deliverable

**Files:**
- Create/Modify: `README.md`
- Create: `docs/architecture/foundation.md`
- Create: `docs/protocol/foundation-rpc.md`

**Interfaces:**
- Consumes: all Plan 1 behavior.
- Produces: reproducible contributor/user path for the foundation milestone.

- [ ] **Step 1: Write README foundation quick start**

README must clearly label status as `Pre-alpha / foundation milestone`. Because the repository is not yet published during this plan, the quick start begins from an existing checkout:

```powershell
cd godot-mcp
npm install
npm run build

godot-mcp init C:\path\to\GodotProject --godot C:\path\to\Godot.exe
godot-mcp doctor C:\path\to\GodotProject --godot C:\path\to\Godot.exe
```

Do not claim runtime mutation/screenshots/transactions are implemented in Plan 1.

- [ ] **Step 2: Document the foundation bridge protocol**

`docs/protocol/foundation-rpc.md` must include complete JSON examples for:
- bridge descriptor;
- addon hello;
- hello ack;
- `project.info` request/success;
- `scene.get_tree` request/success;
- `METHOD_NOT_FOUND` failure.

`docs/architecture/foundation.md` must describe:
- one active project;
- stdio ownership of stdout;
- Node listens only on 127.0.0.1;
- ephemeral token + persistent sessions separation;
- addon reconnect behavior.

- [ ] **Step 3: Run the complete verification matrix**

```bash
npm ci
npm run build
npm run typecheck
npm test
npm run test:integration

git status --short
```

Expected:
- install/build/typecheck/unit tests exit 0;
- integration either PASS with configured Godot or prints the explicit SKIP line;
- `git status --short` shows only the documentation changes before commit.

When a Godot binary is available, also run:

```powershell
$env:REQUIRE_GODOT_INTEGRATION = "1"
npm run test:integration
```

Expected: PASS; this is the release gate for completing Plan 1 on a Godot-capable development machine.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/architecture docs/protocol
git commit -m "docs: document foundation milestone"
```

- [ ] **Step 5: Record Plan 1 completion criteria**

Plan 1 is complete only when all are true:

```text
[ ] npm ci succeeds
[ ] npm run build succeeds
[ ] npm run typecheck succeeds
[ ] npm test succeeds
[ ] godot-mcp init installs the addon idempotently
[ ] godot-mcp doctor reports structured foundation checks
[ ] MCP tools/list exposes session.status, project.info, scene.get_tree
[ ] session.status works with editor disconnected
[ ] Godot addon authenticates to the loopback bridge
[ ] project.info returns live editor/project data
[ ] scene.get_tree returns the deterministic fixture hierarchy
[ ] session manifest persists after shutdown
[ ] bridge descriptor is removed on clean server shutdown
[ ] no MCP diagnostics are emitted on stdout
[ ] real Godot integration test passes on a Godot 4.x machine
```

---

## Plan self-review checklist

### Spec coverage for this plan

Covered now:
- open-source npm monorepo foundation;
- standard MCP stdio server;
- one active project;
- localhost-only Node↔Godot WebSocket;
- structured RPC, no executable GDScript RPC;
- protocol/capability negotiation foundation;
- project-root scope foundation;
- persistent session directory/manifest foundation;
- per-project addon installation;
- editor-connected `project.info` and `scene.get_tree`;
- foundation CLI `init` and `doctor`;
- real editor-handshake integration test.

Intentionally assigned to later approved-spec plans:
- node/scene/script/resource mutation surface and Undo/Redo;
- runtime/debugger bridge;
- editor/game screenshots and visual policy;
- full permission/risk model;
- transactions, snapshots, rollback, checkpoints, locking, audit log expansion;
- headless project validation/run tools beyond foundation doctor;
- Codex auto-registration, full CLI, Windows release CI, examples, contribution/security templates.

### Type consistency

- Protocol version is numeric literal `1` in TypeScript and GDScript payloads.
- First tool names are exactly `session.status`, `project.info`, `scene.get_tree`.
- First editor RPC method names are exactly `project.info`, `scene.get_tree`.
- `SessionStatusResult`, `ProjectInfoResult`, and `SceneTreeResult` are defined in `@godot-mcp/protocol` and consumed by server handlers.
- Node WebSocket server owns the listening socket; Godot addon is the outbound client.
- Persistent sessions and ephemeral runtime bridge descriptors are separate roots.

