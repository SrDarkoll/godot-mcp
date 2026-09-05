import {z} from 'zod/v4';
import type {Variant} from './variant.js';

export const AnimationLoopModeSchema=z.enum(['none','linear','pingpong']);
export type AnimationLoopMode=z.infer<typeof AnimationLoopModeSchema>;

export const AnimationTrackTypeSchema=z.enum(['value','position_3d','rotation_3d','scale_3d','blend_shape','method','bezier','animation']);
export type AnimationTrackType=z.infer<typeof AnimationTrackTypeSchema>;

export const AnimationInterpolationSchema=z.enum(['nearest','linear','cubic','linear_angle','cubic_angle']);
export type AnimationInterpolation=z.infer<typeof AnimationInterpolationSchema>;

export interface AnimationTargetResult{ library:string; animation:string; qualified_name:string; }
export interface AnimationLibraryEntry{ library:string; animations:string[]; }
export interface AnimationListResult{ player_path:string; libraries:AnimationLibraryEntry[]; flattened:string[]; }
export interface AnimationKeyResult{ index:number; time:number; transition:number; value:Variant; }
export interface AnimationTrackResult{
  index:number;
  type:AnimationTrackType;
  path:string;
  enabled:boolean;
  interpolation:AnimationInterpolation;
  loop_wrap:boolean;
  keys:AnimationKeyResult[];
}
export interface AnimationInspectResult extends AnimationTargetResult{
  player_path:string;
  length:number;
  loop_mode:AnimationLoopMode;
  step:number;
  track_count:number;
  tracks:AnimationTrackResult[];
}
export interface AnimationMutationResult extends AnimationTargetResult{ player_path:string; }
export interface AnimationTrackMutationResult extends AnimationMutationResult{ track_index:number; }
export interface AnimationKeyMutationResult extends AnimationTrackMutationResult{ key_index:number; time:number; }
