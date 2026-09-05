import * as z from 'zod/v4';
import {AnimationInterpolationSchema,AnimationLoopModeSchema,AnimationTrackTypeSchema} from '@godot-mcp/protocol';
import type {BridgeServer} from '../bridge/bridge-server.js';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import {addAnimationTrack,configureAnimation,createAnimation,inspectAnimation,insertAnimationKey,listAnimations,removeAnimation,removeAnimationKey} from '../tools/animation-tools.js';
import {toolError,toolSuccess} from './tool-result.js';

const finite=z.number().refine(Number.isFinite,'Expected a finite number');
const nonnegative=finite.refine(value=>value>=0,'Expected a non-negative number');
const positive=finite.refine(value=>value>0,'Expected a positive number');
const target={player_path:z.string().min(1),animation:z.string().min(1).max(128),library:z.string().max(128).optional()};
const configureSchema=z.object({...target,length:nonnegative.optional(),loop_mode:AnimationLoopModeSchema.optional(),step:positive.optional()})
  .refine(value=>value.length!==undefined||value.loop_mode!==undefined||value.step!==undefined,'At least one animation setting is required');

export function registerAnimationTools(registrar:ToolRegistrar,rpc:BridgeServer['rpc']):void{
  registrar.registerTool('animation.list',{description:'List AnimationMixer libraries and animation names.',inputSchema:z.object({player_path:z.string().min(1)})},async args=>{
    try{return toolSuccess(await listAnimations(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('animation.inspect',{description:'Inspect an Animation resource, including tracks and bounded key values.',inputSchema:z.object(target)},async args=>{
    try{return toolSuccess(await inspectAnimation(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('animation.create',{description:'Create an Animation in an AnimationMixer library with Undo/Redo support.',inputSchema:z.object({...target,length:nonnegative.optional(),loop_mode:AnimationLoopModeSchema.optional(),step:positive.optional()})},async args=>{
    try{return toolSuccess(await createAnimation(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('animation.remove',{description:'Remove an Animation from an AnimationMixer library with Undo/Redo support.',inputSchema:z.object(target)},async args=>{
    try{return toolSuccess(await removeAnimation(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('animation.configure',{description:'Set Animation length, loop mode or step with Undo/Redo support.',inputSchema:configureSchema},async args=>{
    try{return toolSuccess(await configureAnimation(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('animation.add_track',{description:'Add and configure a non-audio Animation track with Undo/Redo support.',inputSchema:z.object({...target,type:AnimationTrackTypeSchema,path:z.string().min(1).max(1024),at_position:z.number().int().min(-1).optional(),interpolation:AnimationInterpolationSchema.optional(),loop_wrap:z.boolean().optional()})},async args=>{
    try{return toolSuccess(await addAnimationTrack(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('animation.insert_key',{description:'Insert a new Animation key at an unused timestamp with Undo/Redo support.',inputSchema:z.object({...target,track_index:z.number().int().nonnegative(),time:nonnegative,value:z.unknown(),transition:positive.optional()})},async args=>{
    try{return toolSuccess(await insertAnimationKey(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('animation.remove_key',{description:'Remove an Animation key by track/key index with Undo/Redo support.',inputSchema:z.object({...target,track_index:z.number().int().nonnegative(),key_index:z.number().int().nonnegative()})},async args=>{
    try{return toolSuccess(await removeAnimationKey(rpc,args));}catch(error){return toolError(error);}
  });
}
