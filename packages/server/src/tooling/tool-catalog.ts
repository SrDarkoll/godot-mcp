import type { ToolDomain, ToolProfile } from '@godot-mcp/protocol';

export const TOOL_PROFILES = ['minimal','core','2d','3d','navigation','ui','runtime','full'] as const satisfies readonly ToolProfile[];

export interface StaticToolCatalogEntry { readonly name:string; readonly domain:ToolDomain; readonly profiles:readonly ToolProfile[]; }

function group(domain:ToolDomain, profiles:readonly ToolProfile[], names:readonly string[]):StaticToolCatalogEntry[]{
  return names.map(name=>({name,domain,profiles}));
}

const entries:StaticToolCatalogEntry[]=[
  ...group('2d', ['2d','full'], [
    'camera2d.configure',
    'camera2d.inspect',
    'collision2d.inspect',
    'collision2d.set_shape',
    'node2d.inspect_transform',
    'node2d.set_transform',
    'parallax2d.configure',
    'parallax2d.inspect',
    'sprite2d.configure',
    'sprite2d.inspect',
    'sprite2d.set_texture',
  ]),
  ...group('3d', ['3d','full'], [
    'camera3d.configure',
    'camera3d.inspect',
    'collision3d.inspect',
    'collision3d.set_shape',
    'light3d.configure',
    'light3d.inspect',
    'mesh3d.inspect',
    'mesh3d.set_primitive',
    'node3d.inspect_transform',
    'node3d.set_transform',
  ]),
  ...group('animation', ['2d','3d','ui','full'], [
    'animation.add_track',
    'animation.configure',
    'animation.create',
    'animation.insert_key',
    'animation.inspect',
    'animation.list',
    'animation.remove',
    'animation.remove_key',
  ]),
  ...group('core', ['minimal','core','2d','3d','navigation','ui','runtime','full'], [
    'godot.capabilities',
    'godot.tools',
    'project.info',
    'scene.get_tree',
  ]),
  ...group('debug', ['runtime','full'], [
    'debug.errors',
    'debug.output',
    'debug.performance',
    'debug.warnings',
  ]),
  ...group('editor', ['core','2d','3d','navigation','ui','full'], [
    'editor.change_scene',
    'editor.get_active_scene',
    'editor.get_filesystem',
    'editor.get_open_scenes',
    'editor.get_selected_nodes',
    'editor.redo',
    'editor.scan_filesystem',
    'editor.select_node',
    'editor.undo',
  ]),
  ...group('materials', ['3d','full'], [
    'material3d.clear',
    'material3d.configure_standard',
    'material3d.inspect',
    'material3d.set_standard',
    'shader3d.inspect',
    'shader3d.set_code',
    'shader3d.set_parameter',
  ]),
  ...group('navigation', ['2d','3d','navigation','full'], [
    'navigation.agent.configure',
    'navigation.agent.inspect',
    'navigation.mesh.bake',
    'navigation.mesh.clear',
    'navigation.mesh.configure',
    'navigation.mesh.inspect',
    'navigation.mesh.set',
    'navigation.mesh.set_outlines',
    'navigation.region.configure',
    'navigation.region.inspect',
  ]),
  ...group('node', ['core','2d','3d','navigation','ui','full'], [
    'node.create',
    'node.delete',
    'node.duplicate',
    'node.get_properties',
    'node.get_property',
    'node.inspect',
    'node.list_children',
    'node.move',
    'node.rename',
    'node.reparent',
    'node.set_property',
  ]),
  ...group('object', ['core','full'], [
    'object.call',
    'object.get',
    'object.get_class',
    'object.get_method_list',
    'object.get_property_list',
    'object.get_signal_list',
    'object.set',
  ]),
  ...group('project', ['core','2d','3d','full'], [
    'project.input.add_action',
    'project.input.list',
    'project.input.remove_action',
    'project.settings.get',
    'project.settings.set',
  ]),
  ...group('recovery', ['core','2d','3d','navigation','ui','full'], [
    'checkpoint.create',
    'checkpoint.inspect',
    'checkpoint.list',
    'checkpoint.restore',
    'editor.close_scene',
    'transaction.begin',
    'transaction.commit',
    'transaction.delete_file',
    'transaction.preview',
    'transaction.recover',
    'transaction.rollback',
    'transaction.status',
    'transaction.write_file',
  ]),
  ...group('resource', ['core','2d','3d','navigation','ui','full'], [
    'resource.create',
    'resource.duplicate',
    'resource.inspect',
    'resource.load',
    'resource.save',
    'resource.set_property',
  ]),
  ...group('runtime', ['runtime','full'], [
    'project.run',
    'project.run_scene',
    'project.stop',
    'runtime.get_property',
    'runtime.inspect_node',
    'runtime.pause',
    'runtime.restart',
    'runtime.resume',
    'runtime.scene_tree',
    'runtime.status',
    'runtime.stop',
  ]),
  ...group('scene', ['core','2d','3d','navigation','ui','full'], [
    'scene.create',
    'scene.get_root',
    'scene.instantiate',
    'scene.open',
    'scene.reload',
    'scene.save',
    'scene.save_as',
  ]),
  ...group('script', ['core','2d','3d','ui','full'], [
    'script.attach',
    'script.create',
    'script.detach',
    'script.inspect',
    'script.validate',
  ]),
  ...group('security', ['core','2d','3d','navigation','ui','runtime','full'], [
    'permissions.disable',
    'permissions.enable',
    'permissions.set',
    'permissions.status',
    'risk.preview',
  ]),
  ...group('session', ['core','2d','3d','navigation','ui','runtime','full'], [
    'session.manifest',
  ]),
  ...group('session', ['minimal','core','2d','3d','navigation','ui','runtime','full'], [
    'session.status',
  ]),
  ...group('signal', ['core','2d','3d','ui','full'], [
    'signal.connect',
    'signal.connections',
    'signal.disconnect',
    'signal.list',
  ]),
  ...group('tilemap', ['2d','full'], [
    'tilemap.clear',
    'tilemap.erase_cells',
    'tilemap.get_cells',
    'tilemap.inspect',
    'tilemap.local_to_map',
    'tilemap.map_to_local',
    'tilemap.set_cell',
    'tilemap.set_cells',
  ]),
  ...group('tileset', ['2d','full'], [
    'tileset.add_atlas_source',
    'tileset.create_atlas_tiles',
    'tileset.ensure_for_layer',
    'tileset.inspect',
    'tileset.inspect_atlas_source',
    'tileset.remove_source',
  ]),
  ...group('ui', ['2d','ui','full'], [
    'ui.inspect_layout',
    'ui.set_anchors',
    'ui.set_focus_neighbor',
    'ui.set_layout_preset',
    'ui.set_offsets',
    'ui.set_size_flags',
  ]),
  ...group('visual', ['2d','ui','full'], [
    'visual.capture_viewport_2d',
  ]),
  ...group('visual', ['3d','full'], [
    'visual.capture_viewport_3d',
  ]),
  ...group('visual', ['runtime','full'], [
    'visual.capture_game',
  ]),
  ...group('workflow', ['runtime','full'], [
    'workflow.diff_since',
    'workflow.run_check',
    'workflow.snapshot',
  ]),
];

entries.sort((a,b)=>a.name.localeCompare(b.name));
for(const entry of entries){
  if(entry.profiles.length===0||!entry.profiles.includes('full'))throw new Error(`Invalid MCP tool profiles: ${entry.name}`);
}
const frozenEntries=entries.map(entry=>Object.freeze({...entry,profiles:Object.freeze([...entry.profiles])}));
const byName=new Map<string,StaticToolCatalogEntry>();
for(const entry of frozenEntries){
  if(byName.has(entry.name))throw new Error(`Duplicate MCP tool catalog entry: ${entry.name}`);
  byName.set(entry.name,entry);
}
export const TOOL_CATALOG=Object.freeze(frozenEntries);
export function toolCatalogEntry(name:string):StaticToolCatalogEntry|undefined{return byName.get(name);}
export function toolNamesForProfile(profile:ToolProfile):string[]{return TOOL_CATALOG.filter(entry=>entry.profiles.includes(profile)).map(entry=>entry.name);}
