/** Mirror the native class-scoped allowlist in safety_policy.gd. */
const nativeMethods = new Set([
  'get_class',
  'is_class',
  'get_instance_id',
  'has_method',
  'has_signal',
  'get_name',
  'get_path',
  'get_child_count',
  'is_inside_tree',
  'is_node_ready',
  'is_on_floor',
  'is_on_wall',
  'is_on_ceiling',
  'get_floor_normal',
  'get_width',
  'get_height',
  'get_size',
  'get_length',
]);
const dispatchMethods = new Set([
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
  'call_thread_safe',
  'rpc',
  'rpc_id',
  'set',
  'set_indexed',
  'set_deferred',
  'set_deferred_thread_group',
  'set_thread_safe',
  'set_script',
  'emit_signal',
  'notification',
  'propagate_call',
  'propagate_notification',
]);
export function blockedReflection(args: Record<string, unknown>): boolean {
  const method = String(args.method ?? '');
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(method) || dispatchMethods.has(method)) return true;
  return !nativeMethods.has(method) && args.trusted_script !== true;
}
