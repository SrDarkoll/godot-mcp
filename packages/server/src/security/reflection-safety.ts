const BLOCKED_REFLECTIVE_METHODS = new Set([
  'add_child',
  'add_sibling',
  'call',
  'call_deferred',
  'call_deferred_thread_group',
  'call_thread_safe',
  'callv',
  'crash',
  'create_process',
  'emit_signal',
  'execute',
  'free',
  'kill',
  'notification',
  'open_shell',
  'propagate_call',
  'propagate_notification',
  'queue_free',
  'remove_child',
  'reparent',
  'replace_by',
  'rpc',
  'rpc_config',
  'rpc_id',
  'set',
  'set_deferred',
  'set_deferred_thread_group',
  'set_indexed',
  'set_script',
  'set_thread_safe',
  'shell_open'
]);

export function normalizeReflectiveMethod(args: Record<string, unknown>): string {
  return String(args.method ?? '').trim();
}

export function isBlockedReflectiveMethod(args: Record<string, unknown>): boolean {
  const method = normalizeReflectiveMethod(args);
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(method)) {
    return true;
  }
  return method.length === 0 || method.startsWith('_') || BLOCKED_REFLECTIVE_METHODS.has(method);
}

export function blockedReflectiveMethods(): readonly string[] {
  return [...BLOCKED_REFLECTIVE_METHODS].sort();
}
