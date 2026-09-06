import {describe,expect,it,vi} from 'vitest';
import {inspectTilemap,getTilemapCells,setTilemapCell,setTilemapCells,eraseTilemapCells,clearTilemap,mapTilemapToLocal,localTilemapToMap} from '../src/tools/tilemap-tools.js';
import {inspectTileset,ensureTilesetForLayer,addTilesetAtlasSource,inspectTilesetAtlasSource,createTilesetAtlasTiles,removeTilesetSource} from '../src/tools/tileset-tools.js';
import {registerTilemapTools} from '../src/mcp/register-tilemap-tools.js';
import {registerTilesetTools} from '../src/mcp/register-tileset-tools.js';

function rpc(){return {call:vi.fn(async()=>({ok:true}))};}
const cell={coords:{x:1,y:2},source_id:0,atlas_coords:{x:0,y:0},alternative_tile:0};

describe('TileMapLayer power tools',()=>{
  it('forwards every TileMapLayer operation to the matching bridge method',async()=>{
    const bridge=rpc();
    await inspectTilemap(bridge,{node_path:'/Main/Ground'});
    await getTilemapCells(bridge,{node_path:'/Main/Ground',coords:[{x:0,y:0}]});
    await setTilemapCell(bridge,{node_path:'/Main/Ground',...cell});
    await setTilemapCells(bridge,{node_path:'/Main/Ground',cells:[cell]});
    await eraseTilemapCells(bridge,{node_path:'/Main/Ground',coords:[{x:0,y:0}]});
    await clearTilemap(bridge,{node_path:'/Main/Ground'});
    await mapTilemapToLocal(bridge,{node_path:'/Main/Ground',coords:{x:2,y:3}});
    await localTilemapToMap(bridge,{node_path:'/Main/Ground',position:{x:24,y:40}});
    expect(bridge.call.mock.calls.map(([name])=>name)).toEqual([
      'tilemap.inspect','tilemap.get_cells','tilemap.set_cell','tilemap.set_cells','tilemap.erase_cells','tilemap.clear','tilemap.map_to_local','tilemap.local_to_map'
    ]);
  });

  it('registers exactly the eight TileMapLayer helper names',()=>{
    const names:string[]=[];
    const registrar={registerTool:(name:string)=>names.push(name)} as any;
    registerTilemapTools(registrar,rpc() as any);
    expect(names).toEqual(['tilemap.inspect','tilemap.get_cells','tilemap.set_cell','tilemap.set_cells','tilemap.erase_cells','tilemap.clear','tilemap.map_to_local','tilemap.local_to_map']);
  });
});

describe('TileSet atlas power tools',()=>{
  it('forwards every TileSet operation to the matching bridge method',async()=>{
    const bridge=rpc();
    await inspectTileset(bridge,{node_path:'/Main/Ground'});
    await ensureTilesetForLayer(bridge,{node_path:'/Main/Ground',tile_size:{x:16,y:16}});
    await addTilesetAtlasSource(bridge,{node_path:'/Main/Ground',texture_path:'res://tiles.png',texture_region_size:{x:16,y:16}});
    await inspectTilesetAtlasSource(bridge,{node_path:'/Main/Ground',source_id:0});
    await createTilesetAtlasTiles(bridge,{node_path:'/Main/Ground',source_id:0,tiles:[{atlas_coords:{x:0,y:0}}]});
    await removeTilesetSource(bridge,{node_path:'/Main/Ground',source_id:0});
    expect(bridge.call.mock.calls.map(([name])=>name)).toEqual([
      'tileset.inspect','tileset.ensure_for_layer','tileset.add_atlas_source','tileset.inspect_atlas_source','tileset.create_atlas_tiles','tileset.remove_source'
    ]);
  });

  it('registers exactly the six TileSet helper names and keeps texture_path as schema input',()=>{
    const names:string[]=[]; let atlasSchema:any;
    const registrar={registerTool:(name:string,config:any)=>{names.push(name);if(name==='tileset.add_atlas_source')atlasSchema=config.inputSchema;}} as any;
    registerTilesetTools(registrar,rpc() as any);
    expect(names).toEqual(['tileset.inspect','tileset.ensure_for_layer','tileset.add_atlas_source','tileset.inspect_atlas_source','tileset.create_atlas_tiles','tileset.remove_source']);
    expect(atlasSchema.parse({node_path:'/Main/Ground',texture_path:'res://tiles.png',texture_region_size:{x:16,y:16}}).texture_path).toBe('res://tiles.png');
  });
});
