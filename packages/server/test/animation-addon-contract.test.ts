import {readFile} from 'node:fs/promises';
import {describe,expect,it} from 'vitest';

const handlerUrl=new URL('../../godot-addon/addons/godot_mcp/bridge/handlers/animation_handlers.gd',import.meta.url);
const dispatcherUrl=new URL('../../godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd',import.meta.url);

describe('animation addon contract',()=>{
  it('implements and wires every specialized animation bridge method',async()=>{
    const [handler,dispatcher]=await Promise.all([readFile(handlerUrl,'utf8'),readFile(dispatcherUrl,'utf8')]);
    for(const method of ['list','inspect','create','remove','configure','add_track','insert_key','remove_key']){
      expect(handler).toContain(`func ${method}(`);
      expect(dispatcher).toContain(`"animation.${method}"`);
    }
    expect(handler).toContain('AnimationMixer');
    expect(handler).toContain('EditorUndoRedoManager');
    expect(handler).toContain('variant_serializer.gd');
    expect(handler).toContain('LIMIT_EXCEEDED');
  });
});
