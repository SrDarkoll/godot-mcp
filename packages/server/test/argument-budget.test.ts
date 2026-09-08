import { describe, expect, it } from 'vitest';
import { validateArgumentBudget } from '../src/security/argument-budget.js';
import { BridgeRpcError } from '../src/bridge/rpc-router.js';

describe('validateArgumentBudget', () => {
  it('accepts normal payloads within limits', () => {
    expect(() => validateArgumentBudget(null)).not.toThrow();
    expect(() => validateArgumentBudget(42)).not.toThrow();
    expect(() => validateArgumentBudget('hello godot')).not.toThrow();
    expect(() => validateArgumentBudget([1, 2, 3])).not.toThrow();
    expect(() => validateArgumentBudget({ a: 1, b: 'two', c: [true, false] })).not.toThrow();

    // Nested object within depth 64
    let nested: any = { value: 'leaf' };
    for (let i = 0; i < 30; i++) {
      nested = { child: nested };
    }
    expect(() => validateArgumentBudget(nested)).not.toThrow();
  });

  it('rejects direct cyclical objects', () => {
    const cycle: any = {};
    cycle.self = cycle;

    expect(() => validateArgumentBudget(cycle)).toThrowError(BridgeRpcError);
    try {
      validateArgumentBudget(cycle);
    } catch (err) {
      expect((err as BridgeRpcError).code).toBe('ARGUMENT_TOO_LARGE');
    }
  });

  it('rejects indirect cyclical objects', () => {
    const a: any = { b: null };
    const b: any = { c: null };
    const c: any = { a: null };
    a.b = b;
    b.c = c;
    c.a = a;

    expect(() => validateArgumentBudget(a)).toThrowError(BridgeRpcError);
    try {
      validateArgumentBudget(a);
    } catch (err) {
      expect((err as BridgeRpcError).code).toBe('ARGUMENT_TOO_LARGE');
    }
  });

  it('rejects cyclical arrays', () => {
    const arr: any[] = [];
    arr.push(arr);

    expect(() => validateArgumentBudget(arr)).toThrowError(BridgeRpcError);
    try {
      validateArgumentBudget(arr);
    } catch (err) {
      expect((err as BridgeRpcError).code).toBe('ARGUMENT_TOO_LARGE');
    }
  });

  it('rejects nesting exceeding depth limit of 64', () => {
    let deep: any = { value: 'bottom' };
    for (let i = 0; i < 70; i++) {
      deep = { next: deep };
    }

    expect(() => validateArgumentBudget(deep)).toThrowError(BridgeRpcError);
    try {
      validateArgumentBudget(deep);
    } catch (err) {
      expect((err as BridgeRpcError).code).toBe('ARGUMENT_TOO_LARGE');
    }
  });

  it('rejects arrays nested deeper than 64', () => {
    let deep: any = 'leaf';
    for (let i = 0; i < 70; i++) {
      deep = [deep];
    }

    expect(() => validateArgumentBudget(deep)).toThrowError(BridgeRpcError);
    try {
      validateArgumentBudget(deep);
    } catch (err) {
      expect((err as BridgeRpcError).code).toBe('ARGUMENT_TOO_LARGE');
    }
  });

  it('rejects objects with more than 50,000 items', () => {
    const largeObj: Record<string, number> = {};
    for (let i = 0; i < 50005; i++) {
      largeObj[`k${i}`] = i;
    }

    expect(() => validateArgumentBudget(largeObj)).toThrowError(BridgeRpcError);
    try {
      validateArgumentBudget(largeObj);
    } catch (err) {
      expect((err as BridgeRpcError).code).toBe('ARGUMENT_TOO_LARGE');
    }
  });

  it('rejects arrays with more than 50,000 items', () => {
    const largeArr = new Array(50005).fill(1);

    expect(() => validateArgumentBudget(largeArr)).toThrowError(BridgeRpcError);
    try {
      validateArgumentBudget(largeArr);
    } catch (err) {
      expect((err as BridgeRpcError).code).toBe('ARGUMENT_TOO_LARGE');
    }
  });

  it('rejects strings exceeding 8 MB byte limit', () => {
    // 9 MB string
    const bigString = 'x'.repeat(9 * 1024 * 1024);

    expect(() => validateArgumentBudget(bigString)).toThrowError(BridgeRpcError);
    try {
      validateArgumentBudget(bigString);
    } catch (err) {
      expect((err as BridgeRpcError).code).toBe('ARGUMENT_TOO_LARGE');
    }
  });
});
