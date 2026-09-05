import type {AnimationInspectResult,AnimationInterpolation,AnimationListResult,AnimationLoopMode,AnimationMutationResult,AnimationTrackMutationResult,AnimationKeyMutationResult,AnimationTrackType,Variant} from '@godot-mcp/protocol';
import type {RpcRouter} from '../bridge/rpc-router.js';
type Rpc=Pick<RpcRouter,'call'>;
export interface AnimationPlayerParams{player_path:string;}
export interface AnimationTargetParams extends AnimationPlayerParams{animation:string;library?:string;}
export interface AnimationCreateParams extends AnimationTargetParams{length?:number;loop_mode?:AnimationLoopMode;step?:number;}
export interface AnimationConfigureParams extends AnimationTargetParams{length?:number;loop_mode?:AnimationLoopMode;step?:number;}
export interface AnimationAddTrackParams extends AnimationTargetParams{type:AnimationTrackType;path:string;at_position?:number;interpolation?:AnimationInterpolation;loop_wrap?:boolean;}
export interface AnimationInsertKeyParams extends AnimationTargetParams{track_index:number;time:number;value:Variant|unknown;transition?:number;}
export interface AnimationRemoveKeyParams extends AnimationTargetParams{track_index:number;key_index:number;}
const call=<T>(rpc:Rpc,name:string,params:object)=>rpc.call(name,params as Record<string,unknown>) as Promise<T>;
export const listAnimations=(rpc:Rpc,params:AnimationPlayerParams)=>call<AnimationListResult>(rpc,'animation.list',params);
export const inspectAnimation=(rpc:Rpc,params:AnimationTargetParams)=>call<AnimationInspectResult>(rpc,'animation.inspect',params);
export const createAnimation=(rpc:Rpc,params:AnimationCreateParams)=>call<AnimationMutationResult>(rpc,'animation.create',params);
export const removeAnimation=(rpc:Rpc,params:AnimationTargetParams)=>call<AnimationMutationResult>(rpc,'animation.remove',params);
export const configureAnimation=(rpc:Rpc,params:AnimationConfigureParams)=>call<AnimationMutationResult>(rpc,'animation.configure',params);
export const addAnimationTrack=(rpc:Rpc,params:AnimationAddTrackParams)=>call<AnimationTrackMutationResult>(rpc,'animation.add_track',params);
export const insertAnimationKey=(rpc:Rpc,params:AnimationInsertKeyParams)=>call<AnimationKeyMutationResult>(rpc,'animation.insert_key',params);
export const removeAnimationKey=(rpc:Rpc,params:AnimationRemoveKeyParams)=>call<AnimationKeyMutationResult>(rpc,'animation.remove_key',params);
