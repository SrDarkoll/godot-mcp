import { createServer, type Server, type Socket } from 'node:net';
import { createHash, timingSafeEqual } from 'node:crypto';
import { serveStdio, StdioServerTransport, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import { ToolProfileSchema } from '@godot-mcp/protocol';
import { createMcpServer, type McpServerContext } from './create-server.js';

export const MCP_DISCONNECT_NOTIFICATION = 'notifications/godot-mcp/disconnect';

/** Keep the pipe open until teardown finishes; Windows pipes cannot half-close. */
class PeerTransport extends StdioServerTransport {
  constructor(socket: Socket, private readonly disconnectPeer: () => void) { super(socket, socket); }

  override async start(): Promise<void> {
    const forward = this.onmessage;
    this.onmessage = message => {
      if ('method' in message && message.method === MCP_DISCONNECT_NOTIFICATION && !('id' in message)) {
        this.disconnectPeer(); return;
      }
      forward?.(message);
    };
    await super.start();
  }
}

export function mcpPipeName(projectRoot: string, sessionId: string): string {
  const key = createHash('sha256').update(projectRoot).update('\0').update(sessionId).digest('hex');
  return '\\\\.\\pipe\\godot-mcp-client-' + key;
}

/** Each authenticated peer has its own MCP protocol and approval codec. */
export class SharedMcpServer {
  private readonly listener: Server;
  private readonly sockets = new Set<Socket>();
  private readonly peers = new Map<Socket, StdioServerHandle>();
  private readonly handshakes = new Map<Socket, NodeJS.Timeout>();
  private idleTimer?: NodeJS.Timeout;
  private closing = false;
  private closePromise?: Promise<void>;

  constructor(private readonly ctx: McpServerContext, private readonly token: string,
    private readonly onIdle: () => Promise<void>) {
    this.listener = createServer({ allowHalfOpen: true }, socket => this.accept(socket));
    this.listener.maxConnections = 64;
  }

  async start(): Promise<string> {
    const endpoint = mcpPipeName(this.ctx.session.projectRoot, this.ctx.session.id);
    await new Promise<void>((resolve, reject) => {
      this.listener.once('error', reject);
      this.listener.listen(endpoint, () => { this.listener.off('error', reject); resolve(); });
    });
    return endpoint;
  }

  armStartupTimeout(): void {
    if (this.peers.size || this.closing) return;
    this.idleTimer = setTimeout(() => { void this.onIdle().catch(() => this.close()); }, 5000);
  }

  private accept(socket: Socket): void {
    if (this.closing) { socket.destroy(); return; }
    this.sockets.add(socket);
    let buffered = Buffer.alloc(0);
    const reject = () => { socket.destroy(); };
    this.handshakes.set(socket, setTimeout(reject, 3000));
    socket.on('error', () => reject());
    socket.once('close', () => {
      this.sockets.delete(socket);
      clearTimeout(this.handshakes.get(socket)); this.handshakes.delete(socket);
      void this.disconnect(socket).catch(() => socket.destroy());
    });
    socket.once('end', () => { void this.disconnect(socket).catch(() => socket.destroy()); });
    const hello = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      const newline = buffered.indexOf(10);
      if ((newline < 0 && buffered.length > 4096) || newline > 4096) { reject(); return; }
      if (newline < 0) return;
      socket.pause(); socket.off('data', hello);
      clearTimeout(this.handshakes.get(socket)); this.handshakes.delete(socket);
      try {
        const value = JSON.parse(buffered.subarray(0, newline).toString('utf8'));
        const profile = ToolProfileSchema.safeParse(value?.toolProfile ?? this.ctx.toolProfile ?? 'full');
        if (value?.type !== 'mcp_attach' || value.protocol !== 1 || value.sessionId !== this.ctx.session.id ||
          typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token) ||
          !timingSafeEqual(Buffer.from(value.token), Buffer.from(this.token)) || !profile.success || this.closing) {
          reject(); return;
        }
        clearTimeout(this.idleTimer);
        const transport = new PeerTransport(socket, () => { void this.disconnect(socket).catch(() => socket.destroy()); });
        const peer = serveStdio(() => createMcpServer({ ...this.ctx, toolProfile: profile.data }), {
          transport, onerror: error => console.error(`[godot-mcp] MCP error: ${error.message}`)
        });
        this.peers.set(socket, peer);
        socket.write(JSON.stringify({ type: 'mcp_attached', protocol: 1, sessionId: this.ctx.session.id }) + '\n');
        const tail = buffered.subarray(newline + 1);
        if (tail.length) socket.unshift(tail);
        socket.resume();
      } catch { reject(); }
    };
    socket.on('data', hello);
  }

  private async disconnect(socket: Socket): Promise<void> {
    const peer = this.peers.get(socket);
    if (!peer) { if (!socket.destroyed) socket.destroy(); return; }
    this.peers.delete(socket);
    await peer.close();
    if (!this.closing && this.peers.size === 0) await this.onIdle();
    if (!socket.destroyed) socket.end();
  }

  close(): Promise<void> {
    return this.closePromise ??= this.closeAll();
  }

  private async closeAll(): Promise<void> {
    this.closing = true; clearTimeout(this.idleTimer);
    for (const timer of this.handshakes.values()) clearTimeout(timer);
    this.handshakes.clear();
    await Promise.all([...this.peers.values()].map(peer => peer.close().catch(() => {})));
    this.peers.clear();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve, reject) => this.listener.close(error => error ? reject(error) : resolve()));
  }
}
