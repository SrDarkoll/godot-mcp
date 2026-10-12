import { fork, type ForkOptions } from 'node:child_process';
import { connect, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { SERVER_VERSION, type BridgeDescriptor, type ToolProfile } from '@godot-mcp/protocol';
import { readDescriptor } from '../management/client.js';
import { readProjectConfig } from '../project/project-config.js';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import { MCP_DISCONNECT_NOTIFICATION } from './shared-server.js';

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}

async function startOwner(root: string, bridgePort: number | undefined, profile: ToolProfile): Promise<void> {
  const launchOptions: ForkOptions & { windowsHide: boolean } = {
    detached: true, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: []
  };
  const child = fork(fileURLToPath(new URL('../index.js', import.meta.url)), ['--project-owner', '--project', root,
    ...(bridgePort === undefined ? [] : ['--bridge-port', String(bridgePort)]), '--tool-profile', profile], launchOptions);
  try {
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (error?: Error) => {
        if (done) return; done = true; clearTimeout(timer);
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(() => finish(new BridgeRpcError('SERVER_START_TIMEOUT', 'Project server startup timed out')), 10000);
      child.once('error', () => finish(new BridgeRpcError('SERVER_START_FAILED', 'Unable to launch the project server')));
      child.once('exit', () => finish(new BridgeRpcError('SERVER_START_FAILED', 'Project server exited before becoming ready')));
      child.once('message', (message: unknown) => {
        const value = message as { ok?: boolean; error?: { code?: string; message?: string; details?: Record<string, unknown> } };
        if (value?.ok === true) finish();
        else finish(new BridgeRpcError(value?.error?.code ?? 'SERVER_START_FAILED',
          value?.error?.message ?? 'Project server failed to start', value?.error?.details));
      });
    });
  } finally {
    if (child.connected) child.disconnect();
    child.unref();
  }
}

async function attach(descriptor: BridgeDescriptor, profile: ToolProfile): Promise<Socket> {
  return await new Promise((resolve, reject) => {
    const socket = connect(descriptor.mcpPipe!);
    let buffered = Buffer.alloc(0); let done = false;
    const finish = (error?: Error) => {
      if (done) return; done = true; clearTimeout(timer);
      socket.off('data', hello); socket.off('close', closed); socket.off('error', failed);
      if (error) { socket.destroy(); reject(error); } else resolve(socket);
    };
    const failed = () => finish(new BridgeRpcError('SERVER_UNAVAILABLE', 'Unable to connect to the project session'));
    const closed = () => finish(new BridgeRpcError('SERVER_UNAVAILABLE', 'Project session closed during connection'));
    const timer = setTimeout(failed, 3000);
    const hello = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]); const newline = buffered.indexOf(10);
      if ((newline < 0 && buffered.length > 4096) || newline > 4096) { failed(); return; }
      if (newline < 0) return;
      try {
        const value = JSON.parse(buffered.subarray(0, newline).toString('utf8'));
        if (value.type !== 'mcp_attached' || value.protocol !== 1 || value.sessionId !== descriptor.sessionId) { failed(); return; }
        socket.pause(); const tail = buffered.subarray(newline + 1);
        if (tail.length) socket.unshift(tail);
        finish();
      } catch { failed(); }
    };
    socket.once('connect', () => socket.write(JSON.stringify({ type: 'mcp_attach', protocol: 1,
      token: descriptor.token, sessionId: descriptor.sessionId, toolProfile: profile }) + '\n'));
    socket.on('data', hello); socket.once('error', failed); socket.once('close', closed);
  });
}

/** Retry only attachment/startup, before forwarding any MCP request. */
export async function runProjectClient(root: string, options: { bridgePort?: number; toolProfile?: ToolProfile }): Promise<void> {
  const profile = options.toolProfile ?? (await readProjectConfig(root)).toolProfile;
  const deadline = Date.now() + 10000;
  let launched = false; let socket: Socket | undefined;
  while (Date.now() < deadline) {
    const descriptor = await readDescriptor(root);
    if (descriptor && alive(descriptor.pid)) {
      if (!descriptor.mcpPipe || descriptor.serverVersion !== SERVER_VERSION)
        throw new BridgeRpcError('SERVER_RESTART_REQUIRED', 'An older project server is running. Stop its session and reconnect Codex to load the updated launcher.');
      if (options.bridgePort !== undefined && options.bridgePort !== 0 && options.bridgePort !== descriptor.port)
        throw new BridgeRpcError('BRIDGE_PORT_CONFLICT', 'The active project session uses a different bridge port');
      try { socket = await attach(descriptor, profile); break; }
      catch (error) { if (!(error instanceof BridgeRpcError) || error.code !== 'SERVER_UNAVAILABLE') throw error; }
    } else if (!launched) {
      launched = true;
      try { await startOwner(root, options.bridgePort, profile); }
      catch (error) {
        if (!(error instanceof BridgeRpcError) || error.code !== 'PROJECT_BUSY' ||
          (error.details as { owner?: { operation?: string } } | undefined)?.owner?.operation !== 'server') throw error;
      }
    } else if (!descriptor || !alive(descriptor.pid)) {
      // A previous owner may have been shutting down while we raced its lease.
      launched = false;
    }
    await delay(50);
  }
  if (!socket) throw new BridgeRpcError('SERVER_UNAVAILABLE', 'Project session did not become available within 10 seconds');

  const peer = socket;
  let stopping = false;
  const stop = () => {
    if (stopping || peer.destroyed) return; stopping = true;
    process.stdin.unpipe(peer);
    peer.write(JSON.stringify({ jsonrpc: '2.0', method: MCP_DISCONNECT_NOTIFICATION }) + '\n');
  };
  const finish = () => {
    process.stdin.unpipe(peer); peer.unpipe(process.stdout); process.stdin.pause();
    process.stdin.off('end', stop); process.stdin.off('close', stop);
    process.off('SIGINT', stop); process.off('SIGTERM', stop); process.stdout.off('error', outputError);
  };
  const outputError = () => { peer.destroy(); process.exitCode = 1; };
  peer.once('error', () => { process.exitCode = 1; console.error('[godot-mcp] Project session disconnected; reconnect the MCP client.'); });
  peer.once('close', finish);
  process.stdin.once('end', stop); process.stdin.once('close', stop);
  process.once('SIGINT', stop); process.once('SIGTERM', stop); process.stdout.once('error', outputError);
  peer.pipe(process.stdout, { end: false }); process.stdin.pipe(peer, { end: false }); peer.resume();
}
