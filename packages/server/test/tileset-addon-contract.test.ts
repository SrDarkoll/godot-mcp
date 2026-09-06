import {readFile} from 'node:fs/promises';
import {describe,expect,it} from 'vitest';

const handlerUrl=new URL('../../godot-addon/addons/godot_mcp/bridge/handlers/tileset_handlers.gd',import.meta.url);
const dispatcherUrl=new URL('../../godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd',import.meta.url);

describe('TileSet atlas addon contract',()=>{
  it('implements bounded embedded TileSet/atlas operations with scene-owned Undo/Redo',async()=>{
    const [handler,dispatcher]=await Promise.all([readFile(handlerUrl,'utf8'),readFile(dispatcherUrl,'utf8')]);
    for(const method of ['inspect','ensure_for_layer','add_atlas_source','inspect_atlas_source','create_atlas_tiles','remove_source']){
      expect(handler).toContain(`func ${method}(`);
      expect(dispatcher).toContain(`"tileset.${method}"`);
    }
    expect(handler).toContain('TileSetAtlasSource');
    expect(handler).toContain('ResourceLoader.load');
    expect(handler).toContain('MAX_TILES := 4096');
    expect(handler).toContain('MAX_SOURCES := 512');
    expect(handler).toContain('has_room_for_tile');
    expect(handler).toContain('EditorUndoRedoManager');
    expect(handler).toContain(', 0, layer)');
    expect(handler).toContain('SOURCE_IN_USE');
  });
});
