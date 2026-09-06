import fs from 'node:fs';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
const file=path.resolve(import.meta.dirname,'../../godot-addon/addons/godot_mcp/bridge/handlers/power2d_handlers.gd');
const source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
describe('2D addon contract',()=>{
  it('implements Node2D and Sprite2D guards, snapshots and Undo/Redo context',()=>{
    expect(source).toContain('if not node is Node2D');
    expect(source).toContain('if not node is Sprite2D');
    expect(source).toContain('undo_redo.create_action("Set Node2D Transform", 0, node)');
    expect(source).toContain('undo_redo.create_action("Configure Sprite2D", 0, sprite)');
    expect(source).toContain('Texture2D');
    expect(source).toContain('FRAME_OUT_OF_RANGE');
  });
  it('implements Camera2D validation and snapshot restoration',()=>{
    expect(source).toContain('if not node is Camera2D');
    expect(source).toContain('CAMERA_LIMITS_INVALID');
    expect(source).toContain('set_drag_margin');
    expect(source).toContain('undo_redo.create_action(\"Configure Camera2D\", 0, camera)');
  });
  it('implements CollisionShape2D and Parallax2D authoring guards',()=>{
    expect(source).toContain('RectangleShape2D.new()');
    expect(source).toContain('CircleShape2D.new()');
    expect(source).toContain('CapsuleShape2D.new()');
    expect(source).toContain('PARALLAX_LIMITS_INVALID');
    expect(source).toContain('undo_redo.create_action(\"Set CollisionShape2D Shape\", 0, collider)');
    expect(source).toContain('undo_redo.create_action(\"Configure Parallax2D\", 0, parallax)');
  });
});
