import * as z from 'zod/v4';
import {TileAtlasTileCreateSchema,TilePositiveSizeSchema} from '@godot-mcp/protocol';
import type {BridgeServer} from '../bridge/bridge-server.js';
import type {ToolRegistrar} from '../security/tool-registrar.js';
import {addTilesetAtlasSource,createTilesetAtlasTiles,ensureTilesetForLayer,inspectTileset,inspectTilesetAtlasSource,removeTilesetSource} from '../tools/tileset-tools.js';
import {omitUndefinedValues} from './omit-undefined.js';
import {toolError,toolSuccess} from './tool-result.js';
const nonnegativeInt32=z.number().int().min(0).max(2147483647);
const nonnegativeVector=z.object({x:nonnegativeInt32,y:nonnegativeInt32});
export function registerTilesetTools(registrar:ToolRegistrar,rpc:BridgeServer['rpc']):void{
  registrar.registerTool('tileset.inspect',{description:'Inspect the TileSet assigned to a TileMapLayer and summarize its sources.',inputSchema:z.object({node_path:z.string().min(1)})},async args=>{try{return toolSuccess(await inspectTileset(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('tileset.ensure_for_layer',{description:'Ensure a TileMapLayer has an embedded TileSet without replacing an existing one.',inputSchema:z.object({node_path:z.string().min(1),tile_size:TilePositiveSizeSchema})},async args=>{try{return toolSuccess(await ensureTilesetForLayer(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('tileset.add_atlas_source',{description:'Add a project texture as a TileSetAtlasSource with Undo/Redo support.',inputSchema:z.object({node_path:z.string().min(1),texture_path:z.string().min(1).max(2048),texture_region_size:TilePositiveSizeSchema,source_id:nonnegativeInt32.optional(),margins:nonnegativeVector.optional(),separation:nonnegativeVector.optional()})},async args=>{try{return toolSuccess(await addTilesetAtlasSource(rpc,omitUndefinedValues(args)));}catch(error){return toolError(error);}});
  registrar.registerTool('tileset.inspect_atlas_source',{description:'Inspect one TileSetAtlasSource and its base atlas tiles.',inputSchema:z.object({node_path:z.string().min(1),source_id:nonnegativeInt32})},async args=>{try{return toolSuccess(await inspectTilesetAtlasSource(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('tileset.create_atlas_tiles',{description:'Create up to 4096 base atlas tiles atomically with Undo/Redo.',inputSchema:z.object({node_path:z.string().min(1),source_id:nonnegativeInt32,tiles:z.array(TileAtlasTileCreateSchema).min(1).max(4096)})},async args=>{try{return toolSuccess(await createTilesetAtlasTiles(rpc,args));}catch(error){return toolError(error);}});
  registrar.registerTool('tileset.remove_source',{description:'Remove an unused TileSet source conservatively with Undo/Redo support.',inputSchema:z.object({node_path:z.string().min(1),source_id:nonnegativeInt32})},async args=>{try{return toolSuccess(await removeTilesetSource(rpc,args));}catch(error){return toolError(error);}});
}
