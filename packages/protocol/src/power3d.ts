import {z} from 'zod/v4';
import {VariantSchema} from './variant.js';

const finite=z.number().refine(Number.isFinite,'Expected a finite number');
const positive=finite.refine(value=>value>0,'Expected a number greater than zero');
const nonnegative=finite.refine(value=>value>=0,'Expected a nonnegative number');
const unit=finite.min(0).max(1);
const nodePath=z.string().min(1).max(1024);
const texturePath=z.string().min(1).max(2048).nullable();
export const Power3dVector2Schema=z.object({x:finite,y:finite});
export const Power3dVector3Schema=z.object({x:finite,y:finite,z:finite});
export const Power3dPositiveVector2Schema=z.object({x:positive,y:positive});
export const Power3dPositiveVector3Schema=z.object({x:positive,y:positive,z:positive});
export const Power3dColorSchema=z.object({r:finite,g:finite,b:finite,a:unit.default(1)});
export type Power3dVector2=z.infer<typeof Power3dVector2Schema>;
export type Power3dVector3=z.infer<typeof Power3dVector3Schema>;
export type Power3dColor=z.infer<typeof Power3dColorSchema>;

const stableScale=Power3dVector3Schema.refine(({x,y,z})=>x!==0&&y!==0&&z!==0,'Scale components must be non-zero')
  .refine(({x,y,z})=>(x>0&&y>0&&z>0)||(x<0&&y<0&&z<0),'Scale components must all have the same sign');

export const Node3dSetTransformSchema=z.object({
  node_path:nodePath,
  position:Power3dVector3Schema.optional(),
  rotation_degrees:Power3dVector3Schema.optional(),
  scale:stableScale.optional()
}).refine(value=>value.position!==undefined||value.rotation_degrees!==undefined||value.scale!==undefined,'At least one transform field is required');
export type Node3dSetTransformInput=z.infer<typeof Node3dSetTransformSchema>;

export const Mesh3dPrimitiveSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('box'),size:Power3dPositiveVector3Schema}),
  z.object({kind:z.literal('sphere'),radius:positive,height:positive,hemisphere:z.boolean().optional()}),
  z.object({kind:z.literal('capsule'),radius:positive,height:positive}).refine(value=>value.height>=value.radius*2,'Capsule height must be at least twice its radius'),
  z.object({kind:z.literal('cylinder'),top_radius:nonnegative,bottom_radius:nonnegative,height:positive}).refine(value=>value.top_radius>0||value.bottom_radius>0,'At least one cylinder radius must be greater than zero'),
  z.object({kind:z.literal('plane'),size:Power3dPositiveVector2Schema,orientation:z.enum(['x','y','z']).optional()})
]);
export const Mesh3dSetPrimitiveSchema=z.object({node_path:nodePath,primitive:Mesh3dPrimitiveSchema.nullable()});
export type Mesh3dSetPrimitiveInput=z.infer<typeof Mesh3dSetPrimitiveSchema>;

export const Camera3dConfigureSchema=z.object({
  node_path:nodePath,
  projection:z.enum(['perspective','orthogonal','frustum']).optional(),
  fov:finite.min(1).lt(180).optional(),
  size:positive.optional(),
  near:positive.optional(),
  far:positive.optional(),
  keep_aspect:z.enum(['width','height']).optional(),
  frustum_offset:Power3dVector2Schema.optional(),
  h_offset:finite.optional(),
  v_offset:finite.optional(),
  cull_mask:z.number().int().min(0).max(1048575).optional()
}).refine(value=>value.near===undefined||value.far===undefined||value.far>value.near,'far must be greater than near')
  .refine(value=>Object.entries(value).some(([key,current])=>key!=='node_path'&&current!==undefined),'At least one Camera3D field is required');
export type Camera3dConfigureInput=z.infer<typeof Camera3dConfigureSchema>;

export const Collision3dShapeSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('box'),size:Power3dPositiveVector3Schema}),
  z.object({kind:z.literal('sphere'),radius:positive}),
  z.object({kind:z.literal('capsule'),radius:positive,height:positive}).refine(value=>value.height>=value.radius*2,'Capsule height must be at least twice its radius'),
  z.object({kind:z.literal('cylinder'),radius:positive,height:positive})
]);
export const Collision3dSetShapeSchema=z.object({node_path:nodePath,shape:Collision3dShapeSchema.nullable()});
export type Collision3dSetShapeInput=z.infer<typeof Collision3dSetShapeSchema>;

export const Light3dConfigureSchema=z.object({
  node_path:nodePath,
  color:Power3dColorSchema.optional(),
  energy:nonnegative.optional(),
  indirect_energy:nonnegative.optional(),
  specular:unit.optional(),
  shadow_enabled:z.boolean().optional(),
  range:positive.optional(),
  attenuation:finite.min(0).max(10).optional(),
  spot_angle:finite.gt(0).max(90).optional(),
  spot_angle_attenuation:finite.min(0).max(10).optional(),
  shadow_max_distance:positive.optional()
}).refine(value=>Object.entries(value).some(([key,current])=>key!=='node_path'&&current!==undefined),'At least one Light3D field is required');
export type Light3dConfigureInput=z.infer<typeof Light3dConfigureSchema>;

export const Material3dTargetSchema=z.object({node_path:nodePath,surface_index:z.number().int().min(0).max(1023).optional()});
export type Material3dTargetInput=z.infer<typeof Material3dTargetSchema>;

const standardFields={
  albedo_color:Power3dColorSchema.optional(),
  albedo_texture_path:texturePath.optional(),
  metallic:unit.optional(),
  roughness:unit.optional(),
  emission_enabled:z.boolean().optional(),
  emission:Power3dColorSchema.optional(),
  emission_energy_multiplier:nonnegative.optional(),
  normal_enabled:z.boolean().optional(),
  normal_texture_path:texturePath.optional(),
  normal_scale:nonnegative.optional(),
  cull_mode:z.enum(['back','front','disabled']).optional(),
  transparency:z.enum(['disabled','alpha','alpha_scissor','alpha_hash','alpha_depth_pre_pass']).optional()
};
export const Material3dSetStandardSchema=Material3dTargetSchema.extend(standardFields);
export const Material3dConfigureStandardSchema=Material3dTargetSchema.extend(standardFields)
  .refine(value=>Object.entries(value).some(([key,current])=>!['node_path','surface_index'].includes(key)&&current!==undefined),'At least one StandardMaterial3D field is required');
export type Material3dSetStandardInput=z.infer<typeof Material3dSetStandardSchema>;
export type Material3dConfigureStandardInput=z.infer<typeof Material3dConfigureStandardSchema>;

export const Shader3dSetCodeSchema=Material3dTargetSchema.extend({
  code:z.string().min(1).max(65536).refine(value=>/\bshader_type\s+spatial\s*;/i.test(value),'Shader code must declare shader_type spatial;')
});
export const Shader3dSetParameterSchema=Material3dTargetSchema.extend({
  name:z.string().min(1).max(256),
  value:VariantSchema
});
export type Shader3dSetCodeInput=z.infer<typeof Shader3dSetCodeSchema>;
export type Shader3dSetParameterInput=z.infer<typeof Shader3dSetParameterSchema>;

export interface Node3dTransformResult{
  node_path:string;type:string;position:Power3dVector3;rotation_degrees:Power3dVector3;scale:Power3dVector3;
  global_position:Power3dVector3;global_rotation_degrees:Power3dVector3;global_scale:Power3dVector3;
}
export type Mesh3dPrimitiveResult=
  | {kind:'none'}
  | {kind:'box';size:Power3dVector3}
  | {kind:'sphere';radius:number;height:number;hemisphere:boolean}
  | {kind:'capsule';radius:number;height:number}
  | {kind:'cylinder';top_radius:number;bottom_radius:number;height:number}
  | {kind:'plane';size:Power3dVector2;orientation:'x'|'y'|'z'}
  | {kind:'other';type:string;resource_path:string};
export interface Mesh3dResult{node_path:string;type:string;mesh_type:string;mesh_path:string;surface_count:number;primitive:Mesh3dPrimitiveResult;material_override_type:string;}
export interface Camera3dResult{node_path:string;type:string;current:boolean;projection:'perspective'|'orthogonal'|'frustum';fov:number;size:number;near:number;far:number;keep_aspect:'width'|'height';frustum_offset:Power3dVector2;h_offset:number;v_offset:number;cull_mask:number;}
export type Collision3dShapeResult=
  | {kind:'none'}
  | {kind:'box';resource_path:string;size:Power3dVector3}
  | {kind:'sphere';resource_path:string;radius:number}
  | {kind:'capsule';resource_path:string;radius:number;height:number}
  | {kind:'cylinder';resource_path:string;radius:number;height:number}
  | {kind:'other';resource_path:string;type:string};
export interface Collision3dResult{node_path:string;type:string;shape:Collision3dShapeResult;disabled:boolean;}
export interface Light3dResult{node_path:string;type:string;color:Power3dColor;energy:number;indirect_energy:number;specular:number;shadow_enabled:boolean;range?:number;attenuation?:number;spot_angle?:number;spot_angle_attenuation?:number;shadow_max_distance?:number;}
export interface Material3dResult{node_path:string;surface_index:number|null;slot:'override'|'surface';surface_count:number;material:{kind:'none'|'standard'|'shader'|'other';type:string;resource_path:string;[key:string]:unknown};}
