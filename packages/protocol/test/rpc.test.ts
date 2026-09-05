import { describe, expect, it } from 'vitest';
import { RpcRequestSchema, RpcResponseSchema } from '../src/index.js';

describe('RPC protocol', () => {
  it('accepts a structured request', () => {
    expect(RpcRequestSchema.parse({
      id: 'req-1',
      protocol: 1,
      method: 'project.info',
      params: {}
    })).toMatchObject({ id: 'req-1', method: 'project.info' });
  });

  it('rejects executable-string envelopes', () => {
    expect(() => RpcRequestSchema.parse({ exec: 'queue_free()' })).toThrow();
  });

  it('accepts structured failures', () => {
    expect(RpcResponseSchema.parse({
      id: 'req-2',
      ok: false,
      error: { code: 'METHOD_NOT_FOUND', message: 'unknown method' }
    }).ok).toBe(false);
  });
});
