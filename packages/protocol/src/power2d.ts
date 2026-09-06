import {z} from 'zod/v4';

const finite=z.number().refine(Number.isFinite,'Expected a finite number');
const positive=finite.refine(value=>value>0,'Expected a number greater than zero');
const nonnegative=finite.refine(value=>value>=0,'Expected a nonnegative number');
const int32=z.number().int().min(-2147483648).max(2147483647);
const dragMargin=z.number().min(0).max(1).refine(Number.isFinite,'Expected a finite number');
const nodePath=z.string().min(1).max(1024);

export const Power2dVector2Schema=z.object({x:finite,y:finite});
export type Power2dVector2=z.infer<typeof Power2dVector2Schema>;
export const Power2dPositiveVector2Schema=z.object({x:positive,y:positive});
export const Power2dNonnegativeVector2Schema=z.object({x:nonnegative,y:nonnegative});
export const Power2dRect2Schema=z.object({x:finite,y:finite,width:nonnegative,height:nonnegative});
export type Power2dRect2=z.infer<typeof Power2dRect2Schema>;

export const Node2dSetTransformSchema=z.object({
  node_path:nodePath,
  position:Power2dVector2Schema.optional(),
  rotation_degrees:finite.optional(),
  scale:Power2dVector2Schema.optional(),
  skew_degrees:finite.optional()
}).refine(value=>value.position!==undefined||value.rotation_degrees!==undefined||value.scale!==undefined||value.skew_degrees!==undefined,'At least one transform field is required');
export type Node2dSetTransformInput=z.infer<typeof Node2dSetTransformSchema>;

export const Sprite2dConfigureSchema=z.object({
  node_path:nodePath,
  centered:z.boolean().optional(),
  offset:Power2dVector2Schema.optional(),
  flip_h:z.boolean().optional(),
  flip_v:z.boolean().optional(),
  hframes:z.number().int().min(1).max(4096).optional(),
  vframes:z.number().int().min(1).max(4096).optional(),
  frame:z.number().int().min(0).max(16777215).optional(),
  frame_coords:z.object({x:z.number().int().min(0).max(4095),y:z.number().int().min(0).max(4095)}).optional(),
  region_enabled:z.boolean().optional(),
  region_rect:Power2dRect2Schema.optional(),
  region_filter_clip_enabled:z.boolean().optional()
}).refine(value=>value.frame===undefined||value.frame_coords===undefined,'frame and frame_coords are mutually exclusive').refine(value=>
  Object.entries(value).some(([key,current])=>key!=='node_path'&&current!==undefined),'At least one Sprite2D field is required');
export type Sprite2dConfigureInput=z.infer<typeof Sprite2dConfigureSchema>;

export const Camera2dConfigureSchema=z.object({
  node_path:nodePath,
  enabled:z.boolean().optional(),
  zoom:Power2dPositiveVector2Schema.optional(),
  offset:Power2dVector2Schema.optional(),
  ignore_rotation:z.boolean().optional(),
  limit_enabled:z.boolean().optional(),
  limit_smoothed:z.boolean().optional(),
  limit_left:int32.optional(),
  limit_top:int32.optional(),
  limit_right:int32.optional(),
  limit_bottom:int32.optional(),
  position_smoothing_enabled:z.boolean().optional(),
  position_smoothing_speed:nonnegative.optional(),
  rotation_smoothing_enabled:z.boolean().optional(),
  rotation_smoothing_speed:nonnegative.optional(),
  drag_horizontal_enabled:z.boolean().optional(),
  drag_vertical_enabled:z.boolean().optional(),
  drag_left_margin:dragMargin.optional(),
  drag_top_margin:dragMargin.optional(),
  drag_right_margin:dragMargin.optional(),
  drag_bottom_margin:dragMargin.optional()
}).refine(value=>Object.entries(value).some(([key,current])=>key!=='node_path'&&current!==undefined),'At least one Camera2D field is required');
export type Camera2dConfigureInput=z.infer<typeof Camera2dConfigureSchema>;

export const Collision2dShapeSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('rectangle'),size:Power2dPositiveVector2Schema}),
  z.object({kind:z.literal('circle'),radius:positive}),
  z.object({kind:z.literal('capsule'),radius:positive,height:positive})
]).refine(value=>value.kind!=='capsule'||value.height>=value.radius*2,'Capsule height must be at least twice its radius');
export const Collision2dSetShapeSchema=z.object({node_path:nodePath,shape:Collision2dShapeSchema.nullable()});
export type Collision2dSetShapeInput=z.infer<typeof Collision2dSetShapeSchema>;

export const Parallax2dConfigureSchema=z.object({
  node_path:nodePath,
  repeat_size:Power2dNonnegativeVector2Schema.optional(),
  repeat_times:z.number().int().min(1).max(1024).optional(),
  scroll_scale:Power2dVector2Schema.optional(),
  autoscroll:Power2dVector2Schema.optional(),
  scroll_offset:Power2dVector2Schema.optional(),
  screen_offset:Power2dVector2Schema.optional(),
  follow_viewport:z.boolean().optional(),
  limit_begin:Power2dVector2Schema.optional(),
  limit_end:Power2dVector2Schema.optional()
}).refine(value=>Object.entries(value).some(([key,current])=>key!=='node_path'&&current!==undefined),'At least one Parallax2D field is required');
export type Parallax2dConfigureInput=z.infer<typeof Parallax2dConfigureSchema>;

export interface Node2dTransformResult{
  node_path:string;type:string;position:Power2dVector2;rotation_degrees:number;scale:Power2dVector2;skew_degrees:number;
  global_position:Power2dVector2;global_rotation_degrees:number;global_scale:Power2dVector2;
}
export interface Sprite2dResult{
  node_path:string;type:string;texture_path:string;centered:boolean;offset:Power2dVector2;flip_h:boolean;flip_v:boolean;
  hframes:number;vframes:number;frame:number;frame_coords:{x:number;y:number};region_enabled:boolean;region_rect:Power2dRect2;region_filter_clip_enabled:boolean;
}
export interface Camera2dResult{
  node_path:string;type:string;enabled:boolean;zoom:Power2dVector2;offset:Power2dVector2;ignore_rotation:boolean;
  limit_enabled:boolean;limit_smoothed:boolean;limit_left:number;limit_top:number;limit_right:number;limit_bottom:number;
  position_smoothing_enabled:boolean;position_smoothing_speed:number;rotation_smoothing_enabled:boolean;rotation_smoothing_speed:number;
  drag_horizontal_enabled:boolean;drag_vertical_enabled:boolean;drag_left_margin:number;drag_top_margin:number;drag_right_margin:number;drag_bottom_margin:number;
}
export type Collision2dShapeResult=
  | {kind:'none'}
  | {kind:'rectangle';resource_path:string;size:Power2dVector2}
  | {kind:'circle';resource_path:string;radius:number}
  | {kind:'capsule';resource_path:string;radius:number;height:number}
  | {kind:'other';resource_path:string;type:string};
export interface Collision2dResult{node_path:string;type:string;shape:Collision2dShapeResult;disabled:boolean;one_way_collision:boolean;one_way_collision_margin:number;}
export interface Parallax2dResult{
  node_path:string;type:string;repeat_size:Power2dVector2;repeat_times:number;scroll_scale:Power2dVector2;autoscroll:Power2dVector2;
  scroll_offset:Power2dVector2;screen_offset:Power2dVector2;follow_viewport:boolean;limit_begin:Power2dVector2;limit_end:Power2dVector2;
}
