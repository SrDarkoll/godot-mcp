#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { BridgeServer } from './bridge/bridge-server.js';
import { createMcpServer } from './mcp/create-server.js';
import { resolveProjectRoot } from './project/project-root.js';
import { BridgeDescriptorStore, createBridgeToken } from './session/bridge-descriptor.js';
import { createSession } from './session/session.js';
import { SessionStore } from './session/session-store.js';

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
  const session = createSession(projectRoot);
  await new SessionStore(projectRoot).create(session);

  const token = createBridgeToken();
  const bridge = new BridgeServer({ session, token, ...(args.bridgePort === undefined ? {} : { port: args.bridgePort }) });
  const descriptor = new BridgeDescriptorStore(projectRoot);
  const { port } = await bridge.start();
  await descriptor.write({ port, token, sessionId: session.id });

  const stdio = serveStdio(() => createMcpServer({ session, bridge }), {
    onerror: error => console.error(`[godot-mcp] MCP error: ${error.message}`)
  });

  let shuttingDown = false;
  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await descriptor.remove();
      await bridge.stop();
      await stdio.close();
    } catch (error) {
      console.error(`[godot-mcp] shutdown error: ${error instanceof Error ? error.message : String(error)}`);
      exitCode = 1;
    }
    process.exitCode = exitCode;
  };

  process.once('SIGINT', () => { void shutdown(0); });
  process.once('SIGTERM', () => { void shutdown(0); });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void runServer().catch(error => {
    console.error(`[godot-mcp] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
