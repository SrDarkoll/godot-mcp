import { RpcRequestSchema, RpcResponseSchema, type BridgeErrorCode } from '@godot-mcp/protocol';
import WebSocket from 'ws';

const MAX_REQUEST_BYTES=8*1024*1024;

interface PendingCall {
  requestId:string;
  method:string;
  requestedCount:number|null;
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
    const request = RpcRequestSchema.parse({id:`req-${this.nextId++}`,protocol:1,method,params});
    const socket = this.socketProvider();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new BridgeRpcError('EDITOR_NOT_CONNECTED', 'Editor is not connected; request was not sent',
        {requestId:request.id,rpcMethod:method,dispatchState:'not_sent',executionOutcome:'not_applied',appliedCount:0});
    }

    const encoded=JSON.stringify(request);
    const requestBytes=Buffer.byteLength(encoded);
    if(requestBytes>MAX_REQUEST_BYTES){
      throw new BridgeRpcError('ARGUMENT_TOO_LARGE','Encoded request exceeds the editor input limit',
        {requestId:request.id,rpcMethod:method,dispatchState:'not_sent',executionOutcome:'not_applied',appliedCount:0,requestBytes,maxBytes:MAX_REQUEST_BYTES});
    }

    return await new Promise<unknown>((resolve, reject) => {
      const unknownOutcome={requestId:request.id,rpcMethod:method,dispatchState:'sent_without_confirmation',executionOutcome:'unknown',appliedCount:null};
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new BridgeRpcError('TIMEOUT', `RPC timeout for ${method}; execution outcome is unknown`,unknownOutcome));
      }, timeoutMs);
      this.pending.set(request.id, {requestId:request.id,method,requestedCount:Array.isArray(params.cells)?params.cells.length:null,resolve, reject, timer });
      try {
        socket.send(encoded,error=>{
          if(!error||!this.pending.has(request.id))return;
          clearTimeout(timer);
          this.pending.delete(request.id);
          reject(new BridgeRpcError('EDITOR_NOT_CONNECTED','Editor transport failed without execution confirmation',unknownOutcome));
        });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(request.id);
        reject(new BridgeRpcError('EDITOR_NOT_CONNECTED',error instanceof Error?error.message:String(error),unknownOutcome));
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
      const result=response.result;
      if(pending.method==='tilemap.set_cells'&&result&&typeof result==='object'&&!Array.isArray(result)){
        const changed=(result as Record<string,unknown>).changed_count;
        const applied=typeof changed==='number'&&Number.isSafeInteger(changed)&&changed>=0?changed:null;
        pending.resolve({...result,requestId:response.id,requested_count:pending.requestedCount,applied_count:applied,
          confirmation:applied===null||pending.requestedCount===null||applied>pending.requestedCount?'unknown':applied===pending.requestedCount?'applied':'partial'});
      }else pending.resolve(result);
    } else {
      const details=response.error.details??{};
      pending.reject(new BridgeRpcError(response.error.code, response.error.message,{...details,requestId:response.id,
        rpcMethod:pending.method,dispatchState:'response_received',executionOutcome:details.applied===false?'not_applied':details.executionOutcome??'unknown',
        ...(details.applied===false?{appliedCount:0}:{})}));
    }
  }

  disconnect(transport?:{closeCode:number;closeReason:string}): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new BridgeRpcError('EDITOR_NOT_CONNECTED','Editor disconnected; execution outcome is unknown',
        {requestId:pending.requestId,rpcMethod:pending.method,dispatchState:'sent_without_confirmation',executionOutcome:'unknown',appliedCount:null,
          ...(transport?{transportCloseCode:transport.closeCode,transportCloseReason:transport.closeReason.slice(0,123)}:{})}));
    }
    this.pending.clear();
  }
}
