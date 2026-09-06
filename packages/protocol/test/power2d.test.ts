import {describe,expect,it} from 'vitest';
import {
  Camera2dConfigureSchema,Collision2dSetShapeSchema,Node2dSetTransformSchema,
  Parallax2dConfigureSchema,Sprite2dConfigureSchema
} from '../src/power2d.js';

describe('2D power tool schemas',()=>{
  it('requires at least one Node2D transform field',()=>{
    expect(Node2dSetTransformSchema.safeParse({node_path:'/Main/A'}).success).toBe(false);
    expect(Node2dSetTransformSchema.safeParse({node_path:'/Main/A',position:{x:1,y:2}}).success).toBe(true);
  });
  it('rejects conflicting sprite frame selectors and invalid camera zoom',()=>{
    expect(Sprite2dConfigureSchema.safeParse({node_path:'/Main/S',frame:1,frame_coords:{x:0,y:0}}).success).toBe(false);
    expect(Camera2dConfigureSchema.safeParse({node_path:'/Main/C',zoom:{x:0,y:1}}).success).toBe(false);
  });
  it('rejects invalid capsule geometry and empty parallax configure calls',()=>{
    expect(Collision2dSetShapeSchema.safeParse({node_path:'/Main/C',shape:{kind:'capsule',radius:10,height:10}}).success).toBe(false);
    expect(Collision2dSetShapeSchema.safeParse({node_path:'/Main/C',shape:{kind:'capsule',radius:10,height:20}}).success).toBe(true);
    expect(Parallax2dConfigureSchema.safeParse({node_path:'/Main/P'}).success).toBe(false);
  });
});
