#!/usr/bin/env node
import { isMainModule } from './process/entry-point.js';
import { ToolProfileSchema, type ToolProfile } from '@godot-mcp/protocol';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { BridgeServer } from './bridge/bridge-server.js';
import { createMcpServer } from './mcp/create-server.js';
import { resolveProjectRoot } from './project/project-root.js';
import { BridgeDescriptorStore, createBridgeToken } from './session/bridge-descriptor.js';
import { createSession } from './session/session.js';
import { SessionStore } from './session/session-store.js';
import { VisualTools } from './tools/visual-tools.js';
import {RuntimeService} from './runtime/runtime-service.js';
import {DebuggerService} from './debugger/debugger-service.js';
import {TcpDapTransport} from './debugger/dap-transport.js';
import {HeadlessProcessManager} from './headless/headless-process-manager.js';
import {RecoveryService} from './recovery/recovery-service.js';
import {ToolPolicy} from './security/tool-policy.js';
import {readProjectConfig} from './project/project-config.js';
import {ProjectLease, requireNoAddonJournal} from './project/project-lease.js';
import { SERVER_VERSION } from '@godot-mcp/protocol';
import { runProjectClient } from './mcp/project-client.js';
import { SharedMcpServer } from './mcp/shared-server.js';

interface ServerArgs {
  project?: string;
  bridgePort?: number;
  toolProfile?: ToolProfile;
}

export function parseServerArgs(argv: string[]): ServerArgs {
  const result: ServerArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project') {
      const value = argv[++i];
      if (!value) throw new Error('--project requires a path');
      result.project = value;
      continue;
    }
    if (arg === '--bridge-port') {
      const raw = argv[++i];
      if (!raw) throw new Error('--bridge-port requires a port');
      const port = Number(raw);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid bridge port: ${raw}`);
      result.bridgePort = port;
      continue;
    }
    if (arg === '--tool-profile') {
      const raw = argv[++i];
      if (!raw) throw new Error('--tool-profile requires a profile');
      const parsed = ToolProfileSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`Invalid tool profile: ${raw}`);
      result.toolProfile = parsed.data;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

export async function runServer(argv = process.argv.slice(2)): Promise<void> {
  const args = parseServerArgs(argv);
  const projectRoot = await resolveProjectRoot(args.project ?? process.cwd());
  await runProjectClient(projectRoot, args);
}

/** Exclusive stdio ownership retained for controlled fault injection. */
export async function runExclusiveServer(argv = process.argv.slice(2)): Promise<void> {
  const args = parseServerArgs(argv);
  const projectRoot = await resolveProjectRoot(args.project ?? process.cwd());
  const lease = await ProjectLease.acquire(projectRoot, { operation: 'server' });
  try {
    await startOwnedServer(projectRoot, args, lease);
  } catch (error) {
    await lease.release();
    throw error;
  }
}

async function startOwnedServer(projectRoot: string, args: ServerArgs, lease: ProjectLease, shared = false): Promise<void> {
  await requireNoAddonJournal(projectRoot);
  const config = await readProjectConfig(projectRoot);
  const toolProfile = args.toolProfile ?? config.toolProfile;
  const session = createSession(projectRoot);
  const sessions = new SessionStore(projectRoot);
  await sessions.create(session);

  const token = createBridgeToken();
  let runtime: RuntimeService;
  let debuggerService!: DebuggerService;
  let policy!: ToolPolicy;
  let requestShutdown: () => Promise<void> = async () => { throw new Error('Server is starting'); };
  const bridge = new BridgeServer({ session, token,
    onManagementStatus: async () => ({ permissions: policy.permissions(), activeTransactionId: recovery.activeId, recoveryRequired: await recovery.barrier().then(Boolean).catch(() => true) }),
    onShutdown: () => requestShutdown(),
    onRuntimeEvent: event => { runtime?.acceptEvent(event); debuggerService?.acceptBridgeEvent(event); },
    onDisconnected: () => { runtime?.disconnect(); debuggerService?.editorDisconnected(); policy?.connectionChanged(false); },
    onConnected: () => debuggerService?.editorConnected(),
    onAuthenticated: async hello => { await sessions.update(session.id, m => ({ ...m, godotVersion: hello.godotVersion, addonVersion: hello.addonVersion })); policy?.connectionChanged(true); },
    port: args.bridgePort ?? config.bridgePort });
  runtime = new RuntimeService(session, sessions, bridge);
  debuggerService = new DebuggerService(session, runtime, bridge, () => new TcpDapTransport());
  const visual = new VisualTools(session, sessions, bridge, runtime);
  const recovery = new RecoveryService(session, sessions, bridge);
  const godotBin = config.godotBin ?? (process.env.GODOT_BIN?.trim() || null);
  const headless=new HeadlessProcessManager(session,sessions,{godotBin});
  policy = new ToolPolicy(session, sessions, recovery, () => headless.status());
  const descriptor = new BridgeDescriptorStore(projectRoot);
  const { port } = await bridge.start();
  const context = { session, bridge, sessions, visual, runtime, debugger: debuggerService, recovery, headless, policy, toolProfile };
  const peers = shared ? new SharedMcpServer(context, token, () => requestShutdown()) : null;
  const mcpPipe = peers ? await peers.start() : undefined;
  await descriptor.write({ port, token, sessionId: session.id, ...(mcpPipe ? { mcpPipe, serverVersion: SERVER_VERSION } : {}) });

  const stdio = shared ? null : serveStdio(() => createMcpServer(context), {
    onerror: error => console.error(`[godot-mcp] MCP error: ${error.message}`)
  });

  let shuttingDown = false;
  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const steps = [
      async () => { await Promise.all([policy.close(),headless.close()]); },
      () => debuggerService.close(),
      () => recovery.close(),
      () => runtime.close(),
      () => visual.close(),
      () => policy.flush(),
      () => bridge.stop(),
      () => sessions.finish(session.id, new Date().toISOString()),
      () => sessions.flush(),
      () => descriptor.remove(),
      () => stdio?.close(),
      () => lease.release(),
      () => peers?.close()
    ];
    for (const step of steps) {
      try { await step(); }
      catch { console.error('[godot-mcp] Session shutdown step failed'); exitCode = 1; }
    }
    process.exitCode = exitCode;
  };

  process.once('SIGINT', () => { void shutdown(0); });
  requestShutdown = () => shutdown(0);
  process.once('SIGTERM', () => { void shutdown(0); });
  if (shared) {
    process.send?.({ ok: true });
    peers?.armStartupTimeout();
  } else {
    process.stdin.once('end', () => { void shutdown(0); });
    process.stdin.once('close', () => { void shutdown(0); });
    process.stdin.resume();
  }
}

if (isMainModule(import.meta.url)) {
  const owned = process.argv[2] === '--project-owner' && !!process.send;
  const start = async () => {
    if (!owned) { await runServer(); return; }
    const args = parseServerArgs(process.argv.slice(3));
    const root = await resolveProjectRoot(args.project ?? process.cwd());
    const lease = await ProjectLease.acquire(root, { operation: 'server' });
    try { await startOwnedServer(root, args, lease, true); }
    catch (error) { await lease.release(); throw error; }
  };
  void start().catch(error => {
    if (owned) {
      const failure = error as { code?: string; message?: string; details?: unknown };
      process.send?.({ ok: false, error: { code: failure.code ?? 'SERVER_START_FAILED', message: failure.message ?? 'Project server failed to start', details: failure.details } }, () => process.exit(1));
      return;
    }
    console.error(`[godot-mcp] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
