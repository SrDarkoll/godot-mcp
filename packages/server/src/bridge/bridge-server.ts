import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { AddonHelloSchema } from '@godot-mcp/protocol';
import WebSocket, { WebSocketServer } from 'ws';
import type { Session } from '../session/session.js';
import { BridgeClient } from './bridge-client.js';
import { RpcRouter } from './rpc-router.js';

export interface BridgeServerOptions {
  session: Session;
  token: string;
  port?: number;
}

async function canonicalProjectRoot(value: string): Promise<string> {
  let candidate = value;
  try {
    candidate = await realpath(value);
  } catch {
    // Unit tests can use synthetic Windows roots; real sessions are realpathed.
  }
  candidate = candidate.replace(/\\/g, '/').replace(/\/+$/, '');
  if (/^[A-Za-z]:\//.test(candidate)) candidate = candidate.toLowerCase();
  return candidate;
}

export class BridgeServer {
  private server: WebSocketServer | null = null;
  private client: BridgeClient | null = null;
  readonly rpc: RpcRouter;

  constructor(private readonly options: BridgeServerOptions) {
    this.rpc = new RpcRouter(() => this.client?.socket ?? null);
  }

  get connected(): boolean {
    return this.client !== null && this.client.socket.readyState === WebSocket.OPEN;
  }

  async start(): Promise<{ port: number }> {
    if (this.server) {
      const address = this.server.address();
      if (typeof address === 'object' && address) return { port: address.port };
      throw new Error('Bridge server is already started without a TCP address');
    }

    const server = new WebSocketServer({ host: '127.0.0.1', port: this.options.port ?? 61337 });
    this.server = server;
    server.on('connection', socket => this.handleConnection(socket));

    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Bridge server did not bind a TCP port');
    return { port: address.port };
  }

  async stop(): Promise<void> {
    this.client?.socket.close(1001, 'server shutdown');
    this.client = null;
    this.options.session.editorConnected = false;
    this.rpc.disconnect();
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }

  async waitUntilConnected(timeoutMs = 5000): Promise<void> {
    if (this.connected) return;
    const started = Date.now();
    while (!this.connected) {
      if (Date.now() - started >= timeoutMs) throw new Error('Timeout waiting for Godot editor connection');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  private handleConnection(socket: WebSocket): void {
    if (this.connected) {
      socket.close(1008, 'Only one Godot addon connection is allowed');
      return;
    }

    socket.once('message', raw => {
      void this.authenticate(socket, raw);
    });
  }

  private async authenticate(socket: WebSocket, raw: WebSocket.RawData): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      socket.close(1008, 'Invalid hello payload');
      return;
    }

    const parsed = AddonHelloSchema.safeParse ? AddonHelloSchema.safeParse(payload) : null;
    let hello;
    if (parsed) {
      if (!parsed.success) {
        socket.close(1008, 'Invalid hello payload');
        return;
      }
      hello = parsed.data;
    } else {
      try {
        hello = AddonHelloSchema.parse(payload);
      } catch {
        socket.close(1008, 'Invalid hello payload');
        return;
      }
    }

    if (hello.token !== this.options.token) {
      socket.close(1008, 'Authentication failed');
      return;
    }

    if (hello.protocol !== 1) {
      socket.close(1008, 'Protocol mismatch');
      return;
    }

    const [expectedRoot, actualRoot] = await Promise.all([
      canonicalProjectRoot(this.options.session.projectRoot),
      canonicalProjectRoot(hello.projectRoot)
    ]);
    if (expectedRoot !== actualRoot) {
      socket.close(1008, 'Project mismatch');
      return;
    }

    if (this.connected) {
      socket.close(1008, 'Only one Godot addon connection is allowed');
      return;
    }

    this.client = new BridgeClient(socket, hello);
    this.options.session.editorConnected = true;
    this.options.session.godotVersion = hello.godotVersion;
    this.options.session.addonVersion = hello.addonVersion;

    socket.on('message', message => this.rpc.handleMessage(message));
    socket.once('close', () => {
      if (this.client?.socket === socket) {
        this.client = null;
        this.options.session.editorConnected = false;
        this.rpc.disconnect();
      }
    });

    socket.send(JSON.stringify({ type: 'hello_ack', protocol: 1, sessionId: this.options.session.id }));
  }
}
