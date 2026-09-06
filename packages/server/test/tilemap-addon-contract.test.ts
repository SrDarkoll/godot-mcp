import {readFile} from 'node:fs/promises';
import {describe,expect,it} from 'vitest';

const handlerUrl=new URL('../../godot-addon/addons/godot_mcp/bridge/handlers/tilemap_handlers.gd',import.meta.url);
const dispatcherUrl=new URL('../../godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd',import.meta.url);

describe('TileMapLayer addon contract',()=>{
  it('implements every TileMapLayer bridge method with bounded scene-history mutations',async()=>{
    const [handler,dispatcher]=await Promise.all([readFile(handlerUrl,'utf8'),readFile(dispatcherUrl,'utf8')]);
    for(const method of ['inspect','get_cells','set_cell','set_cells','erase_cells','clear','map_to_local','local_to_map']){
      expect(handler).toContain(`func ${method}(`);
      expect(dispatcher).toContain(`"tilemap.${method}"`);
    }
    expect(handler).toContain('TileMapLayer');
    expect(handler).toContain('MAX_BATCH := 4096');
    expect(handler).toContain('EditorUndoRedoManager');
    expect(handler).toContain('create_action');
    expect(handler).toContain(', 0, layer)');
    expect(handler).toContain('SOURCE_NOT_FOUND');
  });
});
