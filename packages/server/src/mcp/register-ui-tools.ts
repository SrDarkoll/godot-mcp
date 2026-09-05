import * as z from 'zod/v4';
import {UiLayoutPresetSchema,UiLayoutResizeModeSchema,UiSideSchema,UiSizeFlagSchema} from '@godot-mcp/protocol';
import type {BridgeServer} from '../bridge/bridge-server.js';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import {inspectUiLayout,setUiAnchors,setUiFocusNeighbor,setUiLayoutPreset,setUiOffsets,setUiSizeFlags} from '../tools/ui-tools.js';
import {toolError,toolSuccess} from './tool-result.js';

const finite=z.number().refine(Number.isFinite,'Expected a finite number');
const offsetsSchema=z.object({
  node_path:z.string().min(1),left:finite.optional(),top:finite.optional(),right:finite.optional(),bottom:finite.optional()
}).refine(value=>value.left!==undefined||value.top!==undefined||value.right!==undefined||value.bottom!==undefined,'At least one offset is required');

export function registerUiTools(registrar:ToolRegistrar,rpc:BridgeServer['rpc']):void{
  registrar.registerTool('ui.inspect_layout',{description:'Inspect Control anchors, offsets, rectangles, size flags, focus neighbors and parent Container ownership.',inputSchema:z.object({node_path:z.string().min(1)})},async args=>{
    try{return toolSuccess(await inspectUiLayout(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('ui.set_layout_preset',{description:'Apply a Godot Control layout preset with Undo/Redo support.',inputSchema:z.object({node_path:z.string().min(1),preset:UiLayoutPresetSchema,resize_mode:UiLayoutResizeModeSchema.optional(),margin:z.number().int().optional()})},async args=>{
    try{return toolSuccess(await setUiLayoutPreset(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('ui.set_anchors',{description:'Set all four Control anchors atomically with Undo/Redo support.',inputSchema:z.object({node_path:z.string().min(1),left:finite,top:finite,right:finite,bottom:finite,keep_offsets:z.boolean().optional()})},async args=>{
    try{return toolSuccess(await setUiAnchors(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('ui.set_offsets',{description:'Set one or more Control offsets and report whether a parent Container manages layout.',inputSchema:offsetsSchema},async args=>{
    try{return toolSuccess(await setUiOffsets(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('ui.set_size_flags',{description:'Set Control horizontal/vertical size flags and optional stretch ratio with Undo/Redo support.',inputSchema:z.object({node_path:z.string().min(1),horizontal:z.array(UiSizeFlagSchema).max(4).optional(),vertical:z.array(UiSizeFlagSchema).max(4).optional(),stretch_ratio:finite.refine(value=>value>0,'stretch_ratio must be greater than zero').optional()})},async args=>{
    try{return toolSuccess(await setUiSizeFlags(rpc,args));}catch(error){return toolError(error);}
  });
  registrar.registerTool('ui.set_focus_neighbor',{description:'Set or clear a Control focus neighbor using logical scene paths and Undo/Redo support.',inputSchema:z.object({node_path:z.string().min(1),side:UiSideSchema,neighbor_path:z.string().min(1).nullable().optional()})},async args=>{
    try{return toolSuccess(await setUiFocusNeighbor(rpc,args));}catch(error){return toolError(error);}
  });
}
