import {readFile} from 'node:fs/promises';
import {describe,expect,it} from 'vitest';

const handlerUrl=new URL('../../godot-addon/addons/godot_mcp/bridge/handlers/ui_handlers.gd',import.meta.url);
const dispatcherUrl=new URL('../../godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd',import.meta.url);

describe('UI addon contract',()=>{
  it('implements every specialized UI bridge method and wires it through the dispatcher',async()=>{
    const [handler,dispatcher]=await Promise.all([readFile(handlerUrl,'utf8'),readFile(dispatcherUrl,'utf8')]);
    for(const method of ['inspect_layout','set_layout_preset','set_anchors','set_offsets','set_size_flags','set_focus_neighbor']){
      expect(handler).toContain(`func ${method}(`);
      expect(dispatcher).toContain(`"ui.${method}"`);
    }
    expect(handler).toContain('EditorUndoRedoManager');
    expect(handler).toContain('container_managed');
  });
});
