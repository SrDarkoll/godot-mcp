import {z} from 'zod/v4';

const finite=z.number().refine(Number.isFinite,'Expected a finite number');
const positive=finite.refine(value=>value>0,'Expected a number greater than zero');
const nonnegative=finite.refine(value=>value>=0,'Expected a nonnegative number');
const uint32=z.number().int().min(0).max(4294967295);
const nodePath=z.string().min(1).max(1024);
const groupName=z.string().min(1).max(128);
const vector2=z.object({x:finite,y:finite});
const vector3=z.object({x:finite,y:finite,z:finite});
const parsedGeometry=z.enum(['mesh_instances','static_colliders','both']);
const sourceGeometryMode=z.enum(['root_children','groups_with_children','groups_explicit']);

export type NavigationDimension='2d'|'3d';
export type NavigationVector2=z.infer<typeof vector2>;
export type NavigationVector3=z.infer<typeof vector3>;

export const NavigationNodeTargetSchema=z.object({node_path:nodePath});
export type NavigationNodeTarget=z.infer<typeof NavigationNodeTargetSchema>;

export const NavigationRegionConfigureSchema=NavigationNodeTargetSchema.extend({
  enabled:z.boolean().optional(),
  navigation_layers:uint32.optional(),
  enter_cost:nonnegative.optional(),
  travel_cost:positive.optional(),
  use_edge_connections:z.boolean().optional()
}).refine(value=>Object.entries(value).some(([key,current])=>key!=='node_path'&&current!==undefined),'At least one navigation region field is required');
export type NavigationRegionConfigureInput=z.infer<typeof NavigationRegionConfigureSchema>;

export const NavigationMeshSetSchema=NavigationNodeTargetSchema;
export type NavigationMeshSetInput=z.infer<typeof NavigationMeshSetSchema>;

export const NavigationMeshConfigureSchema=NavigationNodeTargetSchema.extend({
  agent_height:positive.optional(),
  agent_radius:nonnegative.optional(),
  agent_max_climb:nonnegative.optional(),
  agent_max_slope:finite.gt(0).max(90).optional(),
  cell_size:positive.optional(),
  cell_height:positive.optional(),
  border_size:nonnegative.optional(),
  parsed_collision_mask:uint32.optional(),
  collision_mask:uint32.optional(),
  parsed_geometry_type:parsedGeometry.optional(),
  source_geometry_mode:sourceGeometryMode.optional(),
  source_group_name:groupName.optional(),
  sample_partition_type:z.enum(['convex','triangulate','watershed','monotone','layers']).optional(),
  region_min_size:nonnegative.optional(),
  region_merge_size:nonnegative.optional(),
  vertices_per_polygon:z.number().int().min(3).max(12).optional()
}).refine(value=>Object.entries(value).some(([key,current])=>key!=='node_path'&&current!==undefined),'At least one navigation mesh field is required');
export type NavigationMeshConfigureInput=z.infer<typeof NavigationMeshConfigureSchema>;

const outline=z.array(vector2).min(3).max(4096);
export const NavigationMeshSetOutlinesSchema=NavigationNodeTargetSchema.extend({
  outlines:z.array(outline).max(64)
}).superRefine((value,ctx)=>{
  const total=value.outlines.reduce((sum,current)=>sum+current.length,0);
  if(total>8192) ctx.addIssue({code:'custom',message:'Navigation outlines may contain at most 8192 points total',path:['outlines']});
});
export type NavigationMeshSetOutlinesInput=z.infer<typeof NavigationMeshSetOutlinesSchema>;

export const NavigationMeshBakeSchema=NavigationNodeTargetSchema.extend({source_root_path:nodePath});
export type NavigationMeshBakeInput=z.infer<typeof NavigationMeshBakeSchema>;

export const NavigationAgentConfigureSchema=NavigationNodeTargetSchema.extend({
  navigation_layers:uint32.optional(),
  path_desired_distance:positive.optional(),
  target_desired_distance:nonnegative.optional(),
  path_max_distance:nonnegative.optional(),
  radius:nonnegative.optional(),
  neighbor_distance:nonnegative.optional(),
  max_neighbors:z.number().int().min(0).max(1024).optional(),
  max_speed:nonnegative.optional(),
  avoidance_enabled:z.boolean().optional(),
  avoidance_layers:uint32.optional(),
  avoidance_mask:uint32.optional(),
  avoidance_priority:finite.min(0).max(1).optional(),
  time_horizon_agents:nonnegative.optional(),
  time_horizon_obstacles:nonnegative.optional(),
  simplify_path:z.boolean().optional(),
  simplify_epsilon:nonnegative.optional(),
  height:positive.optional(),
  use_3d_avoidance:z.boolean().optional(),
  keep_y_velocity:z.boolean().optional(),
  path_height_offset:finite.optional()
}).refine(value=>Object.entries(value).some(([key,current])=>key!=='node_path'&&current!==undefined),'At least one navigation agent field is required');
export type NavigationAgentConfigureInput=z.infer<typeof NavigationAgentConfigureSchema>;

export interface NavigationResourceSummary{type:string;resource_path:string;polygon_count:number;vertex_count:number;}
export interface NavigationRegionResult{
  node_path:string;type:string;dimension:NavigationDimension;enabled:boolean;navigation_layers:number;enter_cost:number;travel_cost:number;
  use_edge_connections:boolean;resource:NavigationResourceSummary|null;
}
export interface NavigationMeshResult{
  node_path:string;type:string;dimension:NavigationDimension;resource:{type:string;resource_path:string}|null;vertex_count:number;polygon_count:number;
  outline_count?:number;outlines?:NavigationVector2[][];agent_height?:number;agent_radius?:number;agent_max_climb?:number;agent_max_slope?:number;
  cell_size?:number;cell_height?:number;border_size?:number;parsed_collision_mask?:number;collision_mask?:number;
  parsed_geometry_type?:'mesh_instances'|'static_colliders'|'both';source_geometry_mode?:'root_children'|'groups_with_children'|'groups_explicit';
  source_group_name?:string;sample_partition_type?:string;region_min_size?:number;region_merge_size?:number;vertices_per_polygon?:number;
}
export interface NavigationAgentResult{
  node_path:string;type:string;dimension:NavigationDimension;navigation_layers:number;path_desired_distance:number;target_desired_distance:number;
  path_max_distance:number;radius:number;neighbor_distance:number;max_neighbors:number;max_speed:number;avoidance_enabled:boolean;
  avoidance_layers:number;avoidance_mask:number;avoidance_priority:number;time_horizon_agents:number;time_horizon_obstacles:number;
  simplify_path:boolean;simplify_epsilon:number;target_position:NavigationVector2|NavigationVector3;velocity:NavigationVector2|NavigationVector3;
  height?:number;use_3d_avoidance?:boolean;keep_y_velocity?:boolean;path_height_offset?:number;
}
