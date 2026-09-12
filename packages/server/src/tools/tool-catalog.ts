import type { Permission, AddonCapabilities } from '@godot-mcp/protocol';
import { BridgeRpcError } from '../bridge/rpc-router.js';

const reads = [
  'project.events',
  'session.status',
  'session.manifest',
  'session.metrics',
  'project.info',
  'scene.get_tree',
  'scene.get_root',
  'scene.batch.preview',
  'node.inspect',
  'node.list_children',
  'node.get_property',
  'node.get_properties',
  'resource.dependencies',
  'resource.impact',
  'object.get_class',
  'object.get_property_list',
  'object.get_method_list',
  'object.get_signal_list',
  'object.get',
  'resource.load',
  'resource.inspect',
  'script.inspect',
  'script.validate',
  'signal.list',
  'signal.connections',
  'project.settings.get',
  'project.input.list',
  'editor.get_active_scene',
  'editor.get_open_scenes',
  'editor.get_selected_nodes',
  'editor.get_filesystem',
  'runtime.status',
  'runtime.scene_tree',
  'runtime.inspect_node',
  'runtime.get_property',
  'debug.output',
  'debug.errors',
  'debug.warnings',
  'debug.performance',
  'permissions.status',
  'risk.preview',
  'transaction.status',
  'transaction.preview',
  'transaction.diff',
  'checkpoint.list',
  'checkpoint.inspect',
] as const;
const writes = [
  'visual.compare',
  'performance.snapshot',
  'performance.compare',
  'scene.batch',
  'project.validate',
  'session.export',
  'node.create',
  'node.delete',
  'node.duplicate',
  'node.rename',
  'node.reparent',
  'node.move',
  'node.set_property',
  'object.set',
  'scene.create',
  'scene.open',
  'scene.save',
  'scene.instantiate',
  'resource.create',
  'resource.save',
  'resource.duplicate',
  'resource.set_property',
  'script.create',
  'script.attach',
  'script.detach',
  'signal.connect',
  'signal.disconnect',
  'project.input.add_action',
  'project.input.remove_action',
  'editor.select_node',
  'editor.change_scene',
  'editor.undo',
  'editor.redo',
  'editor.scan_filesystem',
  'project.run',
  'project.run_scene',
  'runtime.pause',
  'runtime.resume',
  'runtime.restart',
  'visual.capture_game',
  'visual.capture_viewport_2d',
  'visual.capture_viewport_3d',
  'transaction.begin',
  'transaction.write_file',
  'transaction.delete_file',
  'transaction.rollback',
  'checkpoint.create',
  'permissions.set',
  'permissions.enable',
  'permissions.disable',
  'runtime.stop',
  'project.stop',
] as const;
const risky = [
  'editor.import_resources',
  'object.call',
  'scene.reload',
  'scene.save_as',
  'editor.close_scene',
  'project.settings.set',
  'transaction.commit',
  'transaction.recover',
  'checkpoint.restore',
] as const;
export type ToolName = (typeof reads)[number] | (typeof writes)[number] | (typeof risky)[number];
type Capability = Exclude<keyof AddonCapabilities, 'runtimeFeatures'>;
export interface ToolDefinition {
  readonly name: ToolName;
  readonly readOnly: boolean;
  readonly control: boolean;
  readonly local: boolean;
  readonly risk: 'normal' | 'risky';
  readonly permissions: readonly Permission[];
  readonly capabilities: readonly Capability[];
  readonly editorRecovery: boolean;
  readonly barrierExempt: boolean;
  readonly allowedDuringTransaction: boolean;
}
const controls = new Set<ToolName>([
  'project.events',
  'runtime.status',
  'runtime.stop',
  'project.stop',
  'session.status',
  'session.metrics',
  'permissions.status',
  'transaction.status',
  'debug.output',
  'debug.errors',
  'debug.warnings',
]);
const editorRecovery = new Set<ToolName>([
  'transaction.begin',
  'transaction.commit',
  'transaction.recover',
  'checkpoint.restore',
]);
function definition(name: ToolName, readOnly: boolean, risk: 'normal' | 'risky'): ToolDefinition {
  const control = controls.has(name);
  const local =
    name === 'visual.compare' ||
    name.startsWith('performance.') ||
    name === 'project.events' ||
    name === 'project.validate' ||
    /^(transaction|checkpoint|permissions|risk|session)\./.test(name) ||
    /^debug\.(output|errors|warnings)$/.test(name);
  const visual = name.startsWith('visual.');
  const runtime =
    name.startsWith('runtime.') ||
    name === 'project.run' ||
    name === 'project.run_scene' ||
    name === 'debug.performance';
  const permissions: Permission[] = [];
  if (name === 'project.validate') permissions.push('process.godot');
  if (name === 'performance.snapshot') permissions.push('network.local');
  if (!local && !control) permissions.push('network.local', 'filesystem.project');
  if (name === 'transaction.preview' || name === 'transaction.diff')
    permissions.push('filesystem.project');
  if (name === 'session.metrics') permissions.push('filesystem.project');
  if (!readOnly && !control && !name.startsWith('permissions.')) {
    if (local || visual) permissions.push('filesystem.project');
    else if (runtime) permissions.push('runtime.modify', 'process.godot', 'filesystem.project');
    else permissions.push('editor.modify', 'filesystem.project');
  }
  const capabilities: Capability[] = local || control ? [] : ['editor'];
  if (name === 'performance.snapshot') capabilities.push('runtime');
  if (!local && !control) {
    if (runtime || name === 'visual.capture_game') capabilities.push('runtime');
    if (name === 'visual.capture_viewport_2d') capabilities.push('viewport2d');
    if (name === 'visual.capture_viewport_3d') capabilities.push('viewport3d');
    if (
      name === 'editor.undo' ||
      name === 'editor.redo' ||
      name === 'scene.batch' ||
      name === 'scene.batch.preview'
    )
      capabilities.push('undoRedo');
  }
  const barrierExempt =
    name !== 'project.validate' && (local || control || name === 'editor.close_scene');
  return Object.freeze({
    name,
    readOnly,
    control,
    local,
    risk,
    permissions: Object.freeze([...new Set(permissions)]),
    capabilities: Object.freeze(capabilities),
    editorRecovery: editorRecovery.has(name),
    barrierExempt,
    allowedDuringTransaction: readOnly || barrierExempt || visual,
  });
}
export const TOOL_CATALOG: Readonly<Record<ToolName, ToolDefinition>> = Object.freeze(
  Object.fromEntries([
    ...reads.map((name) => [name, definition(name, true, 'normal')]),
    ...writes.map((name) => [name, definition(name, false, 'normal')]),
    ...risky.map((name) => [name, definition(name, false, 'risky')]),
  ]) as Record<ToolName, ToolDefinition>,
);
export const TOOL_NAMES = Object.freeze(Object.keys(TOOL_CATALOG).sort() as ToolName[]);
export function getToolDefinition(name: string): ToolDefinition {
  if (!Object.hasOwn(TOOL_CATALOG, name))
    throw new BridgeRpcError('UNKNOWN_TOOL', `Unclassified tool: ${name}`);
  return TOOL_CATALOG[name as ToolName];
}
export function requiredToolPermissions(
  name: string,
  args: Record<string, unknown>,
  editorConnected: boolean,
): Permission[] {
  const definition = getToolDefinition(name);
  const permissions = [...definition.permissions];
  if (name === 'object.call' && args.trusted_script === true)
    permissions.push('editor.script_methods');
  if (editorConnected && definition.editorRecovery) permissions.push('network.local');
  if (
    ['path', 'resource_path', 'script_path', 'source_path', 'target_path'].some(
      (k) => typeof args[k] === 'string',
    ) ||
    Array.isArray(args.paths)
  )
    permissions.push('filesystem.project');
  return [...new Set(permissions)];
}
