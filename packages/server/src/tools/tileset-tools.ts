import type {TileAtlasTileCreate,TilePositiveSize,TilesetAtlasCreateTilesResult,TilesetAtlasInspectResult,TilesetAtlasSourceMutationResult,TilesetEnsureResult,TilesetInspectResult} from '@godot-mcp/protocol';
import type {RpcRouter} from '../bridge/rpc-router.js';
type Rpc=Pick<RpcRouter,'call'>;
export interface TilesetNodeParams{node_path:string;}
export interface TilesetEnsureParams extends TilesetNodeParams{tile_size:TilePositiveSize;}
export interface TilesetAddAtlasSourceParams extends TilesetNodeParams{texture_path:string;texture_region_size:TilePositiveSize;source_id?:number;margins?:{x:number;y:number};separation?:{x:number;y:number};}
export interface TilesetSourceParams extends TilesetNodeParams{source_id:number;}
export interface TilesetCreateAtlasTilesParams extends TilesetSourceParams{tiles:TileAtlasTileCreate[];}
const call=<T>(rpc:Rpc,name:string,params:object)=>rpc.call(name,params as Record<string,unknown>) as Promise<T>;
export const inspectTileset=(rpc:Rpc,params:TilesetNodeParams)=>call<TilesetInspectResult>(rpc,'tileset.inspect',params);
export const ensureTilesetForLayer=(rpc:Rpc,params:TilesetEnsureParams)=>call<TilesetEnsureResult>(rpc,'tileset.ensure_for_layer',params);
export const addTilesetAtlasSource=(rpc:Rpc,params:TilesetAddAtlasSourceParams)=>call<TilesetAtlasSourceMutationResult>(rpc,'tileset.add_atlas_source',params);
export const inspectTilesetAtlasSource=(rpc:Rpc,params:TilesetSourceParams)=>call<TilesetAtlasInspectResult>(rpc,'tileset.inspect_atlas_source',params);
export const createTilesetAtlasTiles=(rpc:Rpc,params:TilesetCreateAtlasTilesParams)=>call<TilesetAtlasCreateTilesResult>(rpc,'tileset.create_atlas_tiles',params);
export const removeTilesetSource=(rpc:Rpc,params:TilesetSourceParams)=>call<TilesetAtlasSourceMutationResult>(rpc,'tileset.remove_source',params);
