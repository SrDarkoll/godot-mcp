import {spawn,type ChildProcess} from 'node:child_process';
import {cp,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {afterEach,describe,expect,test} from 'vitest';
import {initProject} from '../../packages/cli/src/init/init-project.js';
import {confirmFixtureOperation} from './helpers/confirm-fixture-operation.js';

const fixtureRoot=path.resolve('fixtures/empty-project');
const tempRoots:string[]=[];
const TILE_PNG_BASE64='iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAANUlEQVR42u3OsQ0AMAwCMP5/Os0PVMpiEDPOJNPsQwEAAAAAAACOAeX/JtUAAAAAAAAAzgEPKMv3eUpmLE8AAAAASUVORK5CYII=';

async function waitFor(predicate:()=>boolean|Promise<boolean>,timeoutMs:number):Promise<boolean>{
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    if(await predicate()) return true;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  return await predicate();
}

async function stopProcess(child:ChildProcess|null):Promise<void>{
  if(!child||child.exitCode!==null||child.signalCode!==null) return;
  child.kill();
  await Promise.race([
    new Promise<void>(resolve=>child.once('exit',()=>resolve())),
    new Promise<void>(resolve=>setTimeout(resolve,2000))
  ]);
  if(child.exitCode===null&&child.signalCode===null) child.kill('SIGKILL');
}

afterEach(async()=>{
  await Promise.all(tempRoots.splice(0).map(root=>rm(root,{recursive:true,force:true})));
});

describe('Godot TileMapLayer and TileSet power tools',()=>{
  test('builds a persistent atlas-backed TileMapLayer with atomic editing and safe source removal',async()=>{
    const godotBin=process.env.GODOT_BIN;
    if(!godotBin) throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');

    const tempRoot=await mkdtemp(path.join(os.tmpdir(),'godot-mcp-tilemap-tileset-'));
    tempRoots.push(tempRoot);
    await cp(fixtureRoot,tempRoot,{recursive:true});
    await writeFile(path.join(tempRoot,'tiles.png'),Buffer.from(TILE_PNG_BASE64,'base64'));
    await initProject({projectRoot:tempRoot,godotBin,enable:true});

    const serverEntry=path.resolve('packages/server/dist/index.js');
    const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry,'--project',tempRoot,'--bridge-port','0']});
    const client=new Client({name:'tilemap-tileset-integration-test',version:'0.1.0'},{capabilities:{elicitation:{form:{}}}});
    await client.connect(transport);
    let godot:ChildProcess|null=null;
    const call=(name:string,args:Record<string,unknown>={})=>client.callTool({name,arguments:args});

    try{
      godot=spawn(godotBin,['--headless','--path',tempRoot,'--editor','res://main.tscn'],{stdio:'inherit',windowsHide:true});
      expect(await waitFor(async()=>((await call('session.status')).structuredContent as any)?.editorConnected===true,15000)).toBe(true);
      expect(await waitFor(async()=>!!((await call('scene.get_tree')).structuredContent as any)?.root,10000)).toBe(true);

      const created=await call('node.create',{parent_path:'/Main',type:'TileMapLayer',name:'Ground'});
      expect(created.isError,JSON.stringify(created.structuredContent)).not.toBe(true);

      const ensured=await call('tileset.ensure_for_layer',{node_path:'/Main/Ground',tile_size:{x:16,y:16}});
      expect(ensured.isError,JSON.stringify(ensured.structuredContent)).not.toBe(true);
      expect(ensured.structuredContent).toMatchObject({node_path:'/Main/Ground',created:true,tile_size:{x:16,y:16}});
      const ensuredAgain=await call('tileset.ensure_for_layer',{node_path:'/Main/Ground',tile_size:{x:32,y:32}});
      expect(ensuredAgain.isError).not.toBe(true);
      expect(ensuredAgain.structuredContent).toMatchObject({created:false,tile_size:{x:16,y:16}});

      const missingTexture=await call('tileset.add_atlas_source',{
        node_path:'/Main/Ground',texture_path:'res://missing.png',texture_region_size:{x:16,y:16},source_id:1
      });
      expect(missingTexture.isError).toBe(true);
      expect(missingTexture.structuredContent).toMatchObject({error:{code:'RESOURCE_NOT_FOUND'}});

      const source=await call('tileset.add_atlas_source',{
        node_path:'/Main/Ground',texture_path:'res://tiles.png',texture_region_size:{x:16,y:16},source_id:0
      });
      expect(source.isError,JSON.stringify(source.structuredContent)).not.toBe(true);
      expect(source.structuredContent).toMatchObject({node_path:'/Main/Ground',source_id:0});

      const tiles=[
        {atlas_coords:{x:0,y:0}},
        {atlas_coords:{x:1,y:0}},
        {atlas_coords:{x:0,y:1}},
        {atlas_coords:{x:1,y:1}}
      ];
      const createdTiles=await call('tileset.create_atlas_tiles',{node_path:'/Main/Ground',source_id:0,tiles});
      expect(createdTiles.isError,JSON.stringify(createdTiles.structuredContent)).not.toBe(true);
      expect(createdTiles.structuredContent).toMatchObject({source_id:0,created_count:4});
      const duplicateTile=await call('tileset.create_atlas_tiles',{node_path:'/Main/Ground',source_id:0,tiles:[tiles[0]]});
      expect(duplicateTile.isError).toBe(true);
      expect(duplicateTile.structuredContent).toMatchObject({error:{code:'ALREADY_EXISTS'}});

      const atlas=await call('tileset.inspect_atlas_source',{node_path:'/Main/Ground',source_id:0});
      expect(atlas.isError,JSON.stringify(atlas.structuredContent)).not.toBe(true);
      expect(atlas.structuredContent).toMatchObject({
        node_path:'/Main/Ground',source_id:0,texture_path:'res://tiles.png',texture_region_size:{x:16,y:16},tile_count:4
      });
      expect((atlas.structuredContent as any).tiles.map((tile:any)=>tile.atlas_coords)).toEqual([
        {x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}
      ]);

      const cells=[] as Array<Record<string,unknown>>;
      for(let y=0;y<5;y++){
        for(let x=0;x<5;x++){
          cells.push({
            coords:{x,y},source_id:0,atlas_coords:{x:x%2,y:y%2},alternative_tile:0
          });
        }
      }
      const painted=await call('tilemap.set_cells',{node_path:'/Main/Ground',cells});
      expect(painted.isError,JSON.stringify(painted.structuredContent)).not.toBe(true);
      expect(painted.structuredContent).toMatchObject({node_path:'/Main/Ground',changed_count:25});

      const layer=await call('tilemap.inspect',{node_path:'/Main/Ground'});
      expect(layer.isError,JSON.stringify(layer.structuredContent)).not.toBe(true);
      expect(layer.structuredContent).toMatchObject({node_path:'/Main/Ground',type:'TileMapLayer',has_tileset:true,tile_size:{x:16,y:16},used_cell_count:25});

      const allCells=await call('tilemap.get_cells',{node_path:'/Main/Ground'});
      expect(allCells.isError).not.toBe(true);
      expect((allCells.structuredContent as any).count).toBe(25);
      expect((allCells.structuredContent as any).cells[0]).toMatchObject({coords:{x:0,y:0},source_id:0,atlas_coords:{x:0,y:0}});
      expect((allCells.structuredContent as any).cells[24].coords).toEqual({x:4,y:4});

      const selected=await call('tilemap.get_cells',{node_path:'/Main/Ground',coords:[{x:4,y:3},{x:1,y:2}]});
      expect(selected.isError).not.toBe(true);
      expect((selected.structuredContent as any).cells).toEqual([
        {coords:{x:1,y:2},source_id:0,atlas_coords:{x:1,y:0},alternative_tile:0},
        {coords:{x:4,y:3},source_id:0,atlas_coords:{x:0,y:1},alternative_tile:0}
      ]);

      const invalidCoords=await call('tilemap.map_to_local',{node_path:'/Main/Ground',coords:{x:32768,y:0}});
      expect(invalidCoords.isError).toBe(true);
      const invalidCoordsText=(invalidCoords.content as Array<{type?:string;text?:string}>)
        .filter(item=>item.type==='text')
        .map(item=>item.text??'')
        .join('\n');
      expect(invalidCoordsText).toContain('tilemap.map_to_local');
      expect(invalidCoordsText).toContain('coords.x');

      const mapped=await call('tilemap.map_to_local',{node_path:'/Main/Ground',coords:{x:2,y:3}});
      expect(mapped.isError,JSON.stringify(mapped.structuredContent)).not.toBe(true);
      expect((mapped.structuredContent as any).coords).toEqual({x:2,y:3});
      const inverse=await call('tilemap.local_to_map',{node_path:'/Main/Ground',position:(mapped.structuredContent as any).position});
      expect(inverse.isError).not.toBe(true);
      expect((inverse.structuredContent as any).coords).toEqual({x:2,y:3});

      const inUse=await call('tileset.remove_source',{node_path:'/Main/Ground',source_id:0});
      expect(inUse.isError).toBe(true);
      expect(inUse.structuredContent).toMatchObject({error:{code:'SOURCE_IN_USE'}});

      const erased=await call('tilemap.erase_cells',{node_path:'/Main/Ground',coords:[{x:0,y:0},{x:1,y:0}]});
      expect(erased.isError).not.toBe(true);
      expect(erased.structuredContent).toMatchObject({changed_count:2});
      const afterErase=await call('tilemap.get_cells',{node_path:'/Main/Ground',coords:[{x:0,y:0},{x:1,y:0}]});
      expect((afterErase.structuredContent as any).cells.every((cell:any)=>cell.source_id===-1)).toBe(true);
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      const afterUndo=await call('tilemap.get_cells',{node_path:'/Main/Ground',coords:[{x:0,y:0},{x:1,y:0}]});
      expect((afterUndo.structuredContent as any).cells.every((cell:any)=>cell.source_id===0)).toBe(true);
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});
      const afterRedo=await call('tilemap.get_cells',{node_path:'/Main/Ground',coords:[{x:0,y:0},{x:1,y:0}]});
      expect((afterRedo.structuredContent as any).cells.every((cell:any)=>cell.source_id===-1)).toBe(true);
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});

      const duplicateCoords=await call('tilemap.set_cells',{node_path:'/Main/Ground',cells:[cells[0],cells[0]]});
      expect(duplicateCoords.isError).toBe(true);
      expect(duplicateCoords.structuredContent).toMatchObject({error:{code:'INVALID_ARGUMENT'}});
      const missingSource=await call('tilemap.set_cell',{
        node_path:'/Main/Ground',coords:{x:6,y:6},source_id:99,atlas_coords:{x:0,y:0},alternative_tile:0
      });
      expect(missingSource.isError).toBe(true);
      expect(missingSource.structuredContent).toMatchObject({error:{code:'SOURCE_NOT_FOUND'}});
      const badLayer=await call('tilemap.inspect',{node_path:'/Main/Player'});
      expect(badLayer.isError).toBe(true);
      expect(badLayer.structuredContent).toMatchObject({error:{code:'INVALID_NODE_TYPE'}});

      expect((await call('scene.save')).structuredContent).toMatchObject({saved:true});
      expect((await confirmFixtureOperation(client,'scene.reload',{})).structuredContent).toMatchObject({reloaded:true});

      const persistedTileset=await call('tileset.inspect',{node_path:'/Main/Ground'});
      expect(persistedTileset.isError,JSON.stringify(persistedTileset.structuredContent)).not.toBe(true);
      expect(persistedTileset.structuredContent).toMatchObject({exists:true,tile_size:{x:16,y:16},source_count:1});
      const persistedAtlas=await call('tileset.inspect_atlas_source',{node_path:'/Main/Ground',source_id:0});
      expect(persistedAtlas.isError,JSON.stringify(persistedAtlas.structuredContent)).not.toBe(true);
      expect(persistedAtlas.structuredContent).toMatchObject({tile_count:4,texture_path:'res://tiles.png'});
      const persistedCells=await call('tilemap.get_cells',{node_path:'/Main/Ground'});
      expect(persistedCells.isError).not.toBe(true);
      expect((persistedCells.structuredContent as any).count).toBe(25);

      const cleared=await call('tilemap.clear',{node_path:'/Main/Ground'});
      expect(cleared.isError).not.toBe(true);
      expect(cleared.structuredContent).toMatchObject({changed_count:25});
      const removed=await call('tileset.remove_source',{node_path:'/Main/Ground',source_id:0});
      expect(removed.isError,JSON.stringify(removed.structuredContent)).not.toBe(true);
      expect(removed.structuredContent).toMatchObject({source_id:0});
      expect((await call('tileset.inspect',{node_path:'/Main/Ground'})).structuredContent).toMatchObject({source_count:0});
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect((await call('tileset.inspect',{node_path:'/Main/Ground'})).structuredContent).toMatchObject({source_count:1});
    }finally{
      await client.close().catch(()=>undefined);
      await stopProcess(godot);
    }
  },90000);
});
