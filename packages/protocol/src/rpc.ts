import { z } from 'zod/v4';
import { BridgeErrorCodeSchema } from './errors.js';

export const RpcRequestSchema = z.object({
  id: z.string().min(1),
  protocol: z.literal(1),
  method: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  params: z.record(z.string(), z.unknown()).default({})
});

export const RpcSuccessSchema = z.object({
  id: z.string().min(1),
  ok: z.literal(true),
  result: z.unknown()
});

export const RpcFailureSchema = z.object({
  id: z.string().min(1),
  ok: z.literal(false),
  error: z.object({
    code: BridgeErrorCodeSchema,
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional()
  })
});

export const RpcResponseSchema = z.discriminatedUnion('ok', [
  RpcSuccessSchema,
  RpcFailureSchema
]);

export type RpcRequest = z.infer<typeof RpcRequestSchema>;
export type RpcResponse = z.infer<typeof RpcResponseSchema>;
