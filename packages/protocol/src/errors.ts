import { z } from 'zod/v4';

export const BridgeErrorCodeSchema = z.string().min(1);
export type BridgeErrorCode =
  | 'INVALID_REQUEST'
  | 'PROTOCOL_MISMATCH'
  | 'AUTH_FAILED'
  | 'PROJECT_MISMATCH'
  | 'METHOD_NOT_FOUND'
  | 'EDITOR_NOT_CONNECTED'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'NODE_NOT_FOUND'
  | 'OBJECT_NOT_FOUND'
  | 'NO_OPEN_SCENE'
  | 'INVALID_ARGUMENT'
  | 'INVALID_OPERATION'
  | 'OPERATION_NOT_ALLOWED'
  | 'SAFETY_VIOLATION'
  | 'NOT_FOUND'
  | 'SAVE_FAILED'
  | 'LOAD_FAILED'
  | 'EDITOR_ERROR'
  | (string & {});

