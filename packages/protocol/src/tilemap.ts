import {z} from 'zod/v4';

const mapAxis=z.number().int().min(-32768).max(32767);
const int32Nonnegative=z.number().int().min(0).max(2147483647);
const atlasAxis=int32Nonnegative;
export const TileMapCoordinateSchema=z.object({x:mapAxis,y:mapAxis});
export type TileMapCoordinate=z.infer<typeof TileMapCoordinateSchema>;
export const TileAtlasCoordinateSchema=z.object({x:atlasAxis,y:atlasAxis});
export type TileAtlasCoordinate=z.infer<typeof TileAtlasCoordinateSchema>;
export const TilePositiveSizeSchema=z.object({x:z.number().int().min(1).max(2147483647),y:z.number().int().min(1).max(2147483647)});
export type TilePositiveSize=z.infer<typeof TilePositiveSizeSchema>;
export const TileVector2Schema=z.object({x:z.number().finite(),y:z.number().finite()});
export type TileVector2=z.infer<typeof TileVector2Schema>;

export const TileCellWriteSchema=z.object({
  coords:TileMapCoordinateSchema,
  source_id:int32Nonnegative,
  atlas_coords:TileAtlasCoordinateSchema,
  alternative_tile:int32Nonnegative.default(0)
});
export type TileCellWrite=z.infer<typeof TileCellWriteSchema>;

export const TileAtlasTileCreateSchema=z.object({atlas_coords:TileAtlasCoordinateSchema,size:TilePositiveSizeSchema.optional()});
export type TileAtlasTileCreate=z.infer<typeof TileAtlasTileCreateSchema>;

export interface TileCellResult{
  coords:TileMapCoordinate;
  source_id:number;
  atlas_coords:{x:number;y:number};
  alternative_tile:number;
}
export interface TileRectResult{position:TileMapCoordinate;size:{x:number;y:number};}
export interface TilemapInspectResult{
  node_path:string;
  type:string;
  has_tileset:boolean;
  tile_size:{x:number;y:number}|null;
  used_cell_count:number;
  used_rect:TileRectResult;
  enabled:boolean;
  collision_enabled:boolean;
  navigation_enabled:boolean;
}
export interface TilemapCellsResult{node_path:string;count:number;cells:TileCellResult[];}
export interface TilemapMutationResult{node_path:string;changed_count:number;}
export interface TilemapMapToLocalResult{node_path:string;coords:TileMapCoordinate;position:TileVector2;}
export interface TilemapLocalToMapResult{node_path:string;position:TileVector2;coords:TileMapCoordinate;}

export interface TilesetSourceSummary{
  source_id:number;
  type:string;
  texture_path?:string;
  texture_region_size?:TilePositiveSize;
  margins?:{x:number;y:number};
  separation?:{x:number;y:number};
  atlas_grid_size?:{x:number;y:number};
  tile_count?:number;
}
export interface TilesetInspectResult{
  node_path:string;
  exists:boolean;
  resource_path:string;
  tile_size:{x:number;y:number}|null;
  source_count:number;
  sources:TilesetSourceSummary[];
}
export interface TilesetEnsureResult{node_path:string;created:boolean;tile_size:{x:number;y:number};}
export interface TilesetAtlasSourceMutationResult{node_path:string;source_id:number;}
export interface TilesetAtlasTileResult{atlas_coords:TileAtlasCoordinate;size:TilePositiveSize;}
export interface TilesetAtlasInspectResult extends TilesetAtlasSourceMutationResult{
  texture_path:string;
  texture_region_size:TilePositiveSize;
  margins:{x:number;y:number};
  separation:{x:number;y:number};
  atlas_grid_size:{x:number;y:number};
  tile_count:number;
  tiles:TilesetAtlasTileResult[];
}
export interface TilesetAtlasCreateTilesResult extends TilesetAtlasSourceMutationResult{created_count:number;}
