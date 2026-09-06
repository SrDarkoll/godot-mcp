import type {TileCellWrite,TileMapCoordinate,TileVector2,TilemapCellsResult,TilemapInspectResult,TilemapLocalToMapResult,TilemapMapToLocalResult,TilemapMutationResult} from '@godot-mcp/protocol';
import type {RpcRouter} from '../bridge/rpc-router.js';
type Rpc=Pick<RpcRouter,'call'>;
export interface TilemapNodeParams{node_path:string;}
export interface TilemapGetCellsParams extends TilemapNodeParams{coords?:TileMapCoordinate[];}
export interface TilemapSetCellParams extends TilemapNodeParams,TileCellWrite{}
export interface TilemapSetCellsParams extends TilemapNodeParams{cells:TileCellWrite[];}
export interface TilemapEraseCellsParams extends TilemapNodeParams{coords:TileMapCoordinate[];}
export interface TilemapMapToLocalParams extends TilemapNodeParams{coords:TileMapCoordinate;}
export interface TilemapLocalToMapParams extends TilemapNodeParams{position:TileVector2;}
const call=<T>(rpc:Rpc,name:string,params:object)=>rpc.call(name,params as Record<string,unknown>) as Promise<T>;
export const inspectTilemap=(rpc:Rpc,params:TilemapNodeParams)=>call<TilemapInspectResult>(rpc,'tilemap.inspect',params);
export const getTilemapCells=(rpc:Rpc,params:TilemapGetCellsParams)=>call<TilemapCellsResult>(rpc,'tilemap.get_cells',params);
export const setTilemapCell=(rpc:Rpc,params:TilemapSetCellParams)=>call<TilemapMutationResult>(rpc,'tilemap.set_cell',params);
export const setTilemapCells=(rpc:Rpc,params:TilemapSetCellsParams)=>call<TilemapMutationResult>(rpc,'tilemap.set_cells',params);
export const eraseTilemapCells=(rpc:Rpc,params:TilemapEraseCellsParams)=>call<TilemapMutationResult>(rpc,'tilemap.erase_cells',params);
export const clearTilemap=(rpc:Rpc,params:TilemapNodeParams)=>call<TilemapMutationResult>(rpc,'tilemap.clear',params);
export const mapTilemapToLocal=(rpc:Rpc,params:TilemapMapToLocalParams)=>call<TilemapMapToLocalResult>(rpc,'tilemap.map_to_local',params);
export const localTilemapToMap=(rpc:Rpc,params:TilemapLocalToMapParams)=>call<TilemapLocalToMapResult>(rpc,'tilemap.local_to_map',params);
