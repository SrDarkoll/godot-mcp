import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { AddonHelloSchema, MAX_BRIDGE_PAYLOAD, type AddonHello, type AddonCapabilities } from '@godot-mcp/protocol';
import WebSocket, { WebSocketServer } from 'ws';
import {BridgeRuntimeEventSchema,type BridgeRuntimeEvent} from '@godot-mcp/protocol';
import {BridgeProjectEventSchema} from '@godot-mcp/protocol';
import {ProjectEvents} from '../events/project-events.js';
import type { Session } from '../session/session.js';
import { BridgeClient } from './bridge-client.js';
import { RpcRouter } from './rpc-router.js';
import {ManagementRequestSchema,ManagementStatusSchema,DEFAULT_PERMISSIONS} from '@godot-mcp/protocol';
import {getSessionStatus} from '../tools/session-status.js';

export interface BridgeServerOptions {
  session: Session;
  token: string;
  port?: number;
  onAuthenticated?: (hello: AddonHello) => Promise<void>;
  onRuntimeEvent?: (event:BridgeRuntimeEvent)=>void;
  onDisconnected?: ()=>void;
  onManagementStatus?: ()=>Promise<Record<string,unknown>>;
  onShutdown?: ()=>Promise<void>;
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
  readonly projectEvents:ProjectEvents;
  private closing=false;

  constructor(private readonly options: BridgeServerOptions) {
    this.projectEvents=new ProjectEvents(options.session.id);
    this.rpc = new RpcRouter(() => this.connected ? this.client!.socket : null);
  }

  get connected(): boolean {
    return this.options.session.editorConnected && this.client !== null && this.client.socket.readyState === WebSocket.OPEN;
  }

  get capabilities(): AddonCapabilities | null {
    return this.connected ? this.client!.hello.capabilities : null;
  }

  async start(): Promise<{ port: number }> {
    if (this.server) {
      const address = this.server.address();
      if (typeof address === 'object' && address) return { port: address.port };
      throw new Error('Bridge server is already started without a TCP address');
    }

    const server = new WebSocketServer({ host: '127.0.0.1', port: this.options.port ?? 61337, maxPayload: MAX_BRIDGE_PAYLOAD });
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
    this.projectEvents.close();
    this.closing=true;
    this.client?.socket.close(1001, 'server shutdown');
    this.client = null;
    this.options.session.editorConnected = false;
    this.options.session.runtimeConnected = false;
    this.options.onDisconnected?.();
    this.rpc.disconnect();
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      for(const socket of server.clients)socket.close(1001,'server shutdown');
      const timer=setTimeout(()=>{for(const socket of server.clients)socket.terminate();},2000);
      timer.unref();
      server.close(error => {clearTimeout(timer);error ? reject(error) : resolve();});
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
    socket.on('error', () => { socket.close(); });
    const timer=setTimeout(()=>socket.close(1008,'Handshake timeout'),3000);
    timer.unref();socket.once('close',()=>clearTimeout(timer));
    socket.once('message', raw => {
      clearTimeout(timer);
      if(Buffer.byteLength(raw.toString())>8192){socket.close(1009,'Handshake too large');return;}
      let value:unknown;try{value=JSON.parse(raw.toString());}catch{socket.close(1008,'Invalid handshake');return;}
      if(value&&typeof value==='object'&&'type' in value&&value.type==='management'){
        void this.manage(socket,value).catch(()=>socket.close(1011,'Management failed'));
      }else if(this.closing){socket.close(1001,'Server is closing');}
      else void this.authenticate(socket, raw).catch(() => { socket.close(1011, 'Unable to initialize editor session'); });
    });
  }

  private async manage(socket:WebSocket,value:unknown):Promise<void>{
    const parsed=ManagementRequestSchema.safeParse(value);
    if(!parsed.success){socket.close(1008,'Invalid management request');return;}
    const request=parsed.data;
    const base={type:'management_response',protocol:1,requestId:request.requestId,sessionId:this.options.session.id};
    const fail=(code:string,message:string)=>socket.send(JSON.stringify({...base,ok:false,error:{code,message}}),()=>socket.close(1008));
    if(request.token!==this.options.token){fail('AUTH_FAILED','Management authentication failed');return;}
    if(await canonicalProjectRoot(request.projectRoot)!==await canonicalProjectRoot(this.options.session.projectRoot)){fail('PROJECT_MISMATCH','Management project mismatch');return;}
    if(request.command==='shutdown'){
      if(!this.options.onShutdown){fail('COMMAND_UNAVAILABLE','Shutdown is not configured');return;}
      this.closing=true;
      socket.send(JSON.stringify({...base,ok:true,data:{accepted:true}}),()=>{
        socket.close(1000);
        void this.options.onShutdown!().catch(()=>console.error('[godot-mcp] Management shutdown failed'));
      });
      return;
    }
    try{
      const data=ManagementStatusSchema.parse({...getSessionStatus(this.options.session),state:this.closing?'closing':'running',pid:process.pid,permissions:DEFAULT_PERMISSIONS,activeTransactionId:null,recoveryRequired:false,...await this.options.onManagementStatus?.()});
      socket.send(JSON.stringify({...base,ok:true,data}),()=>socket.close(1000));
    }catch{fail('MANAGEMENT_FAILED','Unable to read server status');}
  }

  private async authenticate(socket: WebSocket, raw: WebSocket.RawData): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      socket.close(1008, 'Invalid hello payload');
      return;
    }

    if (typeof payload === 'object' && payload !== null && 'protocol' in payload && (payload as { protocol: unknown }).protocol !== 1) {
      socket.close(1008, 'Protocol mismatch');
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

    if (this.client) {
      socket.close(1008, 'Only one Godot addon connection is allowed');
      return;
    }

    // Reserve the instance before awaiting persistence to reject a second editor.
    this.client = new BridgeClient(socket, hello);
    try {
      await this.options.onAuthenticated?.(hello);
    } catch (error) {
      if (this.client?.socket === socket) this.client = null;
      throw error;
    }
    if (socket.readyState !== WebSocket.OPEN || this.client?.socket !== socket) {
      if (this.client?.socket === socket) this.client = null;
      return;
    }
    this.options.session.editorConnected = true;
    this.options.session.godotVersion = hello.godotVersion;
    this.options.session.addonVersion = hello.addonVersion;
    this.projectEvents.append('editor.connected',{godotVersion:hello.godotVersion});

    let eventSequence=0;
    socket.on('message', message => {
      if(this.client?.socket!==socket || !this.connected)return;
      let value:unknown;
      try {value=JSON.parse(message.toString());}catch{return;}
      if(typeof value==='object' && value!==null && 'type' in value && value.type==='event') {
        const projectEvent=BridgeProjectEventSchema.safeParse(value);
        if(projectEvent.success){
          if(projectEvent.data.sessionId!==this.options.session.id||projectEvent.data.sequence<=eventSequence)return;
          eventSequence=projectEvent.data.sequence;
          this.projectEvents.append(projectEvent.data.data.kind,projectEvent.data.data);return;
        }
        const event=BridgeRuntimeEventSchema.safeParse(value);
        if(!event.success || event.data.sessionId!==this.options.session.id || event.data.sequence<=eventSequence)return;
        eventSequence=event.data.sequence;
        this.options.onRuntimeEvent?.(event.data);
        if(event.data.event==='runtime.state')this.projectEvents.append('runtime.state',event.data.data);
      }else this.rpc.handleMessage(message);
    });
    socket.once('close', () => {
      if (this.client?.socket === socket) {
        this.client = null;
        this.options.session.editorConnected = false;
        this.options.session.runtimeConnected = false;
        this.projectEvents.append('editor.disconnected',{});
        this.options.onDisconnected?.();
        this.rpc.disconnect();
      }
    });

    socket.send(JSON.stringify({ type: 'hello_ack', protocol: 1, sessionId: this.options.session.id }));
  }
}
