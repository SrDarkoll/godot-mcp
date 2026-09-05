import { expect, it } from 'vitest';
import { approvalArgumentSummary } from '../src/security/approval-summary.js';

it('shows small risky arguments that matter to a human approval', () => {
  expect(approvalArgumentSummary({ permission: 'filesystem.external' }))
    .toContain('permission="filesystem.external"');
  const reflective = approvalArgumentSummary({
    node_path: '/root/Main',
    method: 'delete_save',
    args: ['res://save.dat', true]
  });
  expect(reflective).toContain('method="delete_save"');
  expect(reflective).toContain('res://save.dat');
});

it('does not dump large or sensitive payloads into the approval prompt', () => {
  const secret = 'super-secret-script-body'.repeat(40);
  const summary = approvalArgumentSummary({ path: 'res://script.gd', content: secret });
  expect(summary).toContain('path="res://script.gd"');
  expect(summary).toContain('content=<redacted');
  expect(summary).toContain(`length=${secret.length}`);
  expect(summary).not.toContain('super-secret-script-body');
  const credentials = approvalArgumentSummary({ api_token: 'abc123-secret', client_secret: 'xyz789-secret' });
  expect(credentials).toContain('api_token=<redacted');
  expect(credentials).toContain('client_secret=<redacted');
  expect(credentials).not.toContain('abc123-secret');
  expect(credentials).not.toContain('xyz789-secret');
  expect(summary.length).toBeLessThanOrEqual(600);
});
