import { RpcRequestSchema, RpcResponseSchema, type BridgeErrorCode } from '@godot-mcp/protocol';
import WebSocket from 'ws';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class BridgeRpcError extends Error {
  constructor(public readonly code: BridgeErrorCode, message: string,public readonly details?:Record<string,unknown>) {
    super(message);
    this.name = 'BridgeRpcError';
  }
}

export class RpcRouter {
  private nextId = 1;
  private readonly pending = new Map<string, PendingCall>();

  constructor(private readonly socketProvider: () => WebSocket | null) {}

  async call(method: string, params: Record<string, unknown>, timeoutMs = 5000): Promise<unknown> {
    const socket = this.socketProvider();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new BridgeRpcError('EDITOR_NOT_CONNECTED', 'Editor is not connected');
    }

    const request = RpcRequestSchema.parse({
      id: `req-${this.nextId++}`,
      protocol: 1,
      method,
      params
    });

    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new BridgeRpcError('TIMEOUT', `RPC timeout for ${method}`));
      }, timeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(request.id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  handleMessage(raw: WebSocket.RawData | Buffer | string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }

    let response;
    try {
      response = RpcResponseSchema.parse(parsed);
    } catch {
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new BridgeRpcError(response.error.code, response.error.message, response.error.details));
    }
  }

  disconnect(): void {
    const error = new BridgeRpcError('EDITOR_NOT_CONNECTED', 'Editor disconnected');
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
