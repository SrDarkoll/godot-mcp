import { describe, expect, it } from 'vitest';
import { KNOWN_BRIDGE_ERROR_CODES, RpcRequestSchema, RpcResponseSchema } from '../src/index.js';
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
    it('accepts known and well-formed extension error codes', () => {
        expect(RpcResponseSchema.parse({
            id: 'req-known',
            ok: false,
            error: { code: 'NODE_NOT_FOUND', message: 'missing node' }
        }).ok).toBe(false);
        expect(RpcResponseSchema.parse({
            id: 'req-extension',
            ok: false,
            error: { code: 'CUSTOM_PLUGIN_ERROR', message: 'plugin failure' }
        }).ok).toBe(false);
    });
    it('keeps current built-in runtime and visual error codes discoverable', () => {
        expect(KNOWN_BRIDGE_ERROR_CODES).toEqual(expect.arrayContaining([
            'CAPTURE_FAILED',
            'CAPTURE_TIMEOUT',
            'RESULT_TOO_LARGE'
        ]));
    });
    it('rejects arbitrary or malformed bridge error codes', () => {
        for (const code of ['pepe', ' BAD', 'A', 'BAD-CODE', 'X'.repeat(65)]) {
            expect(() => RpcResponseSchema.parse({
                id: 'req-bad',
                ok: false,
                error: { code, message: 'bad code' }
            })).toThrow();
        }
    });
});
