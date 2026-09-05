import type {UiLayoutResult,UiMutationResult,UiLayoutPreset,UiLayoutResizeMode,UiSide,UiSizeFlag} from '@godot-mcp/protocol';
import type {RpcRouter} from '../bridge/rpc-router.js';

type Rpc=Pick<RpcRouter,'call'>;
export interface UiInspectLayoutParams{node_path:string;}
export interface UiSetLayoutPresetParams{node_path:string;preset:UiLayoutPreset;resize_mode?:UiLayoutResizeMode;margin?:number;}
export interface UiSetAnchorsParams{node_path:string;left:number;top:number;right:number;bottom:number;keep_offsets?:boolean;}
export interface UiSetOffsetsParams{node_path:string;left?:number;top?:number;right?:number;bottom?:number;}
export interface UiSetSizeFlagsParams{node_path:string;horizontal?:UiSizeFlag[];vertical?:UiSizeFlag[];stretch_ratio?:number;}
export interface UiSetFocusNeighborParams{node_path:string;side:UiSide;neighbor_path?:string|null;}
const call=<T>(rpc:Rpc,name:string,params:object)=>rpc.call(name,params as Record<string,unknown>) as Promise<T>;
export const inspectUiLayout=(rpc:Rpc,params:UiInspectLayoutParams)=>call<UiLayoutResult>(rpc,'ui.inspect_layout',params);
export const setUiLayoutPreset=(rpc:Rpc,params:UiSetLayoutPresetParams)=>call<UiMutationResult>(rpc,'ui.set_layout_preset',params);
export const setUiAnchors=(rpc:Rpc,params:UiSetAnchorsParams)=>call<UiMutationResult>(rpc,'ui.set_anchors',params);
export const setUiOffsets=(rpc:Rpc,params:UiSetOffsetsParams)=>call<UiMutationResult>(rpc,'ui.set_offsets',params);
export const setUiSizeFlags=(rpc:Rpc,params:UiSetSizeFlagsParams)=>call<UiMutationResult>(rpc,'ui.set_size_flags',params);
export const setUiFocusNeighbor=(rpc:Rpc,params:UiSetFocusNeighborParams)=>call<UiMutationResult>(rpc,'ui.set_focus_neighbor',params);
