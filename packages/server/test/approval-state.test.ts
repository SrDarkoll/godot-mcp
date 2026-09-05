import { expect, it } from 'vitest';
import { approvalStateBinding } from '../src/security/approval-state.js';

function context(method: string, clientId?: string): any {
  return {
    mcpReq: { method },
    http: clientId ? { authInfo: { clientId } } : undefined
  };
}

it('binds approval state to server session, MCP method and authenticated client when present', () => {
  const stdio = approvalStateBinding('session-a', context('tools/call'));
  expect(stdio).toBe('session-a\0tools/call\0stdio');
  expect(approvalStateBinding('session-b', context('tools/call'))).not.toBe(stdio);
  expect(approvalStateBinding('session-a', context('resources/read'))).not.toBe(stdio);
  expect(approvalStateBinding('session-a', context('tools/call', 'client-1'))).not.toBe(stdio);
  expect(approvalStateBinding('session-a', context('tools/call', 'client-1')))
    .not.toBe(approvalStateBinding('session-a', context('tools/call', 'client-2')));
});
