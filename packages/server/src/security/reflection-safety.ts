const BLOCKED_REFLECTIVE_METHODS = new Set([
    'free',
    'queue_free',
    'crash',
    'execute',
    'create_process',
    'kill',
    'shell_open',
    'open_shell',
    'call',
    'callv',
    'call_deferred',
    'call_deferred_thread_group',
    'set',
    'set_indexed',
    'set_deferred',
    'set_deferred_thread_group',
    'set_script',
    'rpc',
    'rpc_id',
    'rpc_config',
    'propagate_call',
    'replace_by',
    'remove_child',
    'add_child',
    'add_sibling',
    'reparent'
]);
export function normalizeReflectiveMethod(args: Record<string, unknown>): string {
    return String(args.method ?? '').trim();
}
export function isBlockedReflectiveMethod(args: Record<string, unknown>): boolean {
    const method = normalizeReflectiveMethod(args);
    return method.length === 0 || method.startsWith('_') || BLOCKED_REFLECTIVE_METHODS.has(method);
}
export function blockedReflectiveMethods(): readonly string[] {
    return [...BLOCKED_REFLECTIVE_METHODS].sort();
}
