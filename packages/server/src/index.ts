#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
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
import {HeadlessProcessManager} from './headless/headless-process-manager.js';
import {RecoveryService} from './recovery/recovery-service.js';
import {ToolPolicy} from './security/tool-policy.js';
import {readProjectConfig} from './project/project-config.js';

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
  const config=await readProjectConfig(projectRoot);
  const toolProfile=args.toolProfile??config.toolProfile;
  const session = createSession(projectRoot);
  const sessions = new SessionStore(projectRoot);
  await sessions.create(session);

  const token = createBridgeToken();
  let runtime:RuntimeService;
  let requestShutdown:()=>Promise<void>=async()=>{throw new Error('Server is starting');};
  const bridge = new BridgeServer({ session, token,
    onManagementStatus:async()=>({permissions:policy.permissions(),activeTransactionId:recovery.activeId,recoveryRequired:await recovery.barrier().then(Boolean).catch(()=>true)}),
    onShutdown:()=>requestShutdown(),
    onRuntimeEvent:event=>runtime?.acceptEvent(event),onDisconnected:()=>runtime?.disconnect(),
    onAuthenticated:hello => sessions.update(session.id,m=>({...m,godotVersion:hello.godotVersion,addonVersion:hello.addonVersion})),
    port:args.bridgePort??config.bridgePort });
  runtime=new RuntimeService(session,sessions,bridge);
  const visual = new VisualTools(session,sessions,bridge,runtime);
  const recovery=new RecoveryService(session,sessions,bridge);
  const godotBin=config.godotBin ?? (process.env.GODOT_BIN?.trim() || null);
  const headless=new HeadlessProcessManager(session,sessions,{godotBin});
  const policy=new ToolPolicy(session,sessions,recovery,()=>headless.status());
  const descriptor = new BridgeDescriptorStore(projectRoot);
  const { port } = await bridge.start();
  await descriptor.write({ port, token, sessionId: session.id });

  const stdio = serveStdio(() => createMcpServer({ session, bridge, sessions, visual, runtime, recovery, headless, policy, toolProfile }), {
    onerror: error => console.error(`[godot-mcp] MCP error: ${error.message}`)
  });

  let shuttingDown = false;
  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const steps = [async() => { await Promise.all([policy.close(),headless.close()]); },() => recovery.close(),() => runtime.close(),() => visual.close(),() => policy.flush(),() => bridge.stop(),
      () => sessions.finish(session.id,new Date().toISOString()),() => sessions.flush(),
      () => descriptor.remove(),() => stdio.close()];
    for (const step of steps) {
      try { await step(); }
      catch {console.error('[godot-mcp] Session shutdown step failed');exitCode=1;}
    }
    process.exitCode = exitCode;
  };

  process.once('SIGINT', () => { void shutdown(0); });
  requestShutdown=()=>shutdown(0);
  process.once('SIGTERM', () => { void shutdown(0); });
  process.stdin.once('end', () => { void shutdown(0); });
  process.stdin.once('close', () => { void shutdown(0); });
  process.stdin.resume();
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void runServer().catch(error => {
    console.error(`[godot-mcp] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
