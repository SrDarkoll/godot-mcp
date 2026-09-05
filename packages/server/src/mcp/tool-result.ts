import { BridgeRpcError } from '../bridge/rpc-router.js';
import type { CaptureResult } from '@godot-mcp/protocol';

export function toolImageSuccess(value: CaptureResult, data: string) {
  return {...toolSuccess(value),content:[
    {type:'text' as const,text:JSON.stringify(value,null,2)},
    {type:'image' as const,mimeType:'image/png',data}
  ]};
}

export function toolSuccess<T extends object>(value: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>
  };
}

export function toolError(error: unknown) {
  const code = error instanceof BridgeRpcError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof Error ? error.message : String(error);
  const structuredContent = { error: { code, message, ...(error instanceof BridgeRpcError && error.details ? {details:error.details}:{}) } };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
    isError: true
  };
}
