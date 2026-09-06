import * as z from 'zod/v4';
import {TileCellWriteSchema,TileMapCoordinateSchema,TileVector2Schema} from '@godot-mcp/protocol';
import type {BridgeServer} from '../bridge/bridge-server.js';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import {clearTilemap,eraseTilemapCells,getTilemapCells,inspectTilemap,localTilemapToMap,mapTilemapToLocal,setTilemapCell,setTilemapCells} from '../tools/tilemap-tools.js';
import {omitUndefinedValues} from './omit-undefined.js';
import {toolError,toolSuccess} from './tool-result.js';
const node=z.object({node_path:z.string().min(1)});
export function registerTilemapTools(registrar:ToolRegistrar,rpc:BridgeServer['rpc']):void{
  registrar.registerTool('tilemap.inspect',{description:'Inspect a modern Godot TileMapLayer without enumerating every cell.',inputSchema:node},async args=>{try{return toolSuccess(await inspectTilemap(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('tilemap.get_cells',{description:'Inspect selected TileMapLayer cells or enumerate all used cells up to 4096.',inputSchema:z.object({node_path:z.string().min(1),coords:z.array(TileMapCoordinateSchema).max(4096).optional()})},async args=>{try{return toolSuccess(await getTilemapCells(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('tilemap.set_cell',{description:'Set one TileMapLayer cell with Undo/Redo support.',inputSchema:z.object({node_path:z.string().min(1),...TileCellWriteSchema.shape})},async args=>{try{return toolSuccess(await setTilemapCell(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('tilemap.set_cells',{description:'Atomically set up to 4096 TileMapLayer cells in one Undo/Redo action.',inputSchema:z.object({node_path:z.string().min(1),cells:z.array(TileCellWriteSchema).min(1).max(4096)})},async args=>{try{return toolSuccess(await setTilemapCells(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('tilemap.erase_cells',{description:'Atomically erase up to 4096 TileMapLayer cells with exact Undo/Redo.',inputSchema:z.object({node_path:z.string().min(1),coords:z.array(TileMapCoordinateSchema).min(1).max(4096)})},async args=>{try{return toolSuccess(await eraseTilemapCells(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('tilemap.clear',{description:'Clear a TileMapLayer with bounded exact Undo/Redo.',inputSchema:node},async args=>{try{return toolSuccess(await clearTilemap(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('tilemap.map_to_local',{description:'Convert a TileMapLayer map coordinate to local pixel position.',inputSchema:z.object({node_path:z.string().min(1),coords:TileMapCoordinateSchema})},async args=>{try{return toolSuccess(await mapTilemapToLocal(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('tilemap.local_to_map',{description:'Convert a TileMapLayer local pixel position to map coordinate.',inputSchema:z.object({node_path:z.string().min(1),position:TileVector2Schema})},async args=>{try{return toolSuccess(await localTilemapToMap(rpc,args));}catch(error){return toolError(error);}});
}
