#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { BridgeServer } from './bridge/bridge-server.js';
import { createMcpServer } from './mcp/create-server.js';
import { resolveProjectRoot } from './project/project-root.js';
import { BridgeDescriptorStore, createBridgeToken } from './session/bridge-descriptor.js';
import { createSession } from './session/session.js';
import { SessionStore } from './session/session-store.js';
import { VisualTools } from './tools/visual-tools.js';
import {RuntimeService} from './runtime/runtime-service.js';
import {RecoveryService} from './recovery/recovery-service.js';
import {ToolPolicy} from './security/tool-policy.js';
import {readProjectConfig} from './project/project-config.js';
import {ProjectLease,requireNoAddonJournal} from './project/project-lease.js';

interface ServerArgs {
  project?: string;
  bridgePort?: number;
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
    throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

export async function runServer(argv = process.argv.slice(2)): Promise<void> {
  const args = parseServerArgs(argv);
  const projectRoot = await resolveProjectRoot(args.project ?? process.cwd());
  const lease=await ProjectLease.acquire(projectRoot);
  try{await startOwnedServer(projectRoot,args,lease);}catch(error){await lease.release();throw error;}
}

async function startOwnedServer(projectRoot:string,args:ServerArgs,lease:ProjectLease):Promise<void>{
  await requireNoAddonJournal(projectRoot);
  const config=await readProjectConfig(projectRoot);
  const session = createSession(projectRoot);
  const sessions = new SessionStore(projectRoot);
  await sessions.create(session);

  const token = createBridgeToken();
  let runtime:RuntimeService;
  let requestShutdown:()=>Promise<void>=async()=>{throw new Error('Server is starting');};
  const bridge = new BridgeServer({ session, token,
    onManagementStatus:async()=>({permissions:policy.permissions(),activeTransactionId:recovery.activeId,recoveryRequired:await recovery.barrier().then(Boolean).catch(()=>true)}),
    onShutdown:()=>requestShutdown(),
    onRuntimeEvent:event=>runtime?.acceptEvent(event),onDisconnected:()=>{runtime?.disconnect();policy.connectionChanged(false);},
    onAuthenticated:async hello => {await sessions.update(session.id,m=>({...m,godotVersion:hello.godotVersion,addonVersion:hello.addonVersion}));policy.connectionChanged(true);},
    port:args.bridgePort??config.bridgePort });
  runtime=new RuntimeService(session,sessions,bridge);
  const visual = new VisualTools(session,sessions,bridge,runtime);
  const recovery=new RecoveryService(session,sessions,bridge);
  const policy=new ToolPolicy(session,sessions,recovery);
  const descriptor = new BridgeDescriptorStore(projectRoot);
  let stdio:ReturnType<typeof serveStdio>;
  try{
   const { port } = await bridge.start();
   await descriptor.write({ port, token, sessionId: session.id });
   stdio = serveStdio(() => createMcpServer({ session, bridge, sessions, visual, runtime, recovery, policy }), {
    onerror: error => console.error(`[godot-mcp] MCP error: ${error.message}`)
  });
  }catch(error){await bridge.stop();await descriptor.remove();throw error;}

  let shuttingDown = false;
  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const steps = [() => policy.close(),() => recovery.close(),() => runtime.close(),() => visual.close(),() => policy.flush(),() => bridge.stop(),
      () => sessions.finish(session.id,new Date().toISOString()),() => sessions.flush(),
      () => stdio.close(),() => lease.release(),() => descriptor.remove()];
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
