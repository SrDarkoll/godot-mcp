import { z } from 'zod/v4';

export const BridgeErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'PROTOCOL_MISMATCH',
  'AUTH_FAILED',
  'PROJECT_MISMATCH',
  'METHOD_NOT_FOUND',
  'EDITOR_NOT_CONNECTED',
  'TIMEOUT',
  'INTERNAL_ERROR'
]);
export type BridgeErrorCode = z.infer<typeof BridgeErrorCodeSchema>;
