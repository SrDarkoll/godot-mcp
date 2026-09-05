import { describe, expect, it } from 'vitest';
import { ADDON_VERSION, PROTOCOL_VERSION, SERVER_VERSION } from '../src/index.js';

describe('protocol version exports', () => {
  it('exports stable foundation versions', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(SERVER_VERSION).toBe('0.1.0');
    expect(ADDON_VERSION).toBe('0.1.0');
  });
});
