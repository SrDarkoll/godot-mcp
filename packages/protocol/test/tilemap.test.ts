import {describe,expect,it} from 'vitest';
import {TileAtlasCoordinateSchema,TileAtlasTileCreateSchema,TileCellWriteSchema,TileMapCoordinateSchema} from '../src/tilemap.js';

describe('TileMapLayer protocol',()=>{
  it('bounds serialized map coordinates to Godot 16-bit signed range',()=>{
    expect(TileMapCoordinateSchema.parse({x:-32768,y:32767})).toEqual({x:-32768,y:32767});
    expect(()=>TileMapCoordinateSchema.parse({x:32768,y:0})).toThrow();
    expect(()=>TileMapCoordinateSchema.parse({x:0,y:-32769})).toThrow();
    expect(()=>TileMapCoordinateSchema.parse({x:0.5,y:0})).toThrow();
  });

  it('requires non-negative atlas coordinates and valid cell identifiers',()=>{
    expect(TileAtlasCoordinateSchema.parse({x:0,y:1})).toEqual({x:0,y:1});
    expect(()=>TileAtlasCoordinateSchema.parse({x:-1,y:0})).toThrow();
    expect(TileCellWriteSchema.parse({coords:{x:1,y:2},source_id:0,atlas_coords:{x:0,y:0},alternative_tile:0})).toEqual({coords:{x:1,y:2},source_id:0,atlas_coords:{x:0,y:0},alternative_tile:0});
    expect(()=>TileCellWriteSchema.parse({coords:{x:1,y:2},source_id:-1,atlas_coords:{x:0,y:0},alternative_tile:0})).toThrow();
  });

  it('requires positive atlas tile sizes when supplied',()=>{
    expect(TileAtlasTileCreateSchema.parse({atlas_coords:{x:1,y:2}})).toEqual({atlas_coords:{x:1,y:2}});
    expect(TileAtlasTileCreateSchema.parse({atlas_coords:{x:1,y:2},size:{x:2,y:1}})).toEqual({atlas_coords:{x:1,y:2},size:{x:2,y:1}});
    expect(()=>TileAtlasTileCreateSchema.parse({atlas_coords:{x:1,y:2},size:{x:0,y:1}})).toThrow();
  });
});
