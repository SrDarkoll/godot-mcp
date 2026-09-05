import type WebSocket from 'ws';
import type { AddonHello } from '@godot-mcp/protocol';

export class BridgeClient {
  constructor(
    public readonly socket: WebSocket,
    public readonly hello: AddonHello
  ) {}
}
