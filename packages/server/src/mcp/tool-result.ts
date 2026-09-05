import { BridgeRpcError } from '../bridge/rpc-router.js';

export function toolSuccess<T extends object>(value: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>
  };
}

export function toolError(error: unknown) {
  const code = error instanceof BridgeRpcError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof Error ? error.message : String(error);
  const structuredContent = { error: { code, message } };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
    isError: true
  };
}
