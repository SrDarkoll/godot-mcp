import {describe,expect,it} from 'vitest';
import {
  Camera3dConfigureSchema,Collision3dSetShapeSchema,Light3dConfigureSchema,Material3dConfigureStandardSchema,
  Mesh3dSetPrimitiveSchema,Node3dSetTransformSchema,Shader3dSetCodeSchema,Shader3dSetParameterSchema
} from '../src/power3d.js';

describe('3D power tool contracts',()=>{
  it('rejects unstable Node3D scales and invalid primitive dimensions',()=>{
    expect(Node3dSetTransformSchema.safeParse({node_path:'/Main/Model',scale:{x:1,y:0,z:1}}).success).toBe(false);
    expect(Node3dSetTransformSchema.safeParse({node_path:'/Main/Model',scale:{x:1,y:-1,z:1}}).success).toBe(false);
    expect(Node3dSetTransformSchema.safeParse({node_path:'/Main/Model',scale:{x:-1,y:-2,z:-3}}).success).toBe(true);
    expect(Mesh3dSetPrimitiveSchema.safeParse({node_path:'/Main/Model',primitive:{kind:'capsule',radius:1,height:1}}).success).toBe(false);
    expect(Mesh3dSetPrimitiveSchema.safeParse({node_path:'/Main/Model',primitive:{kind:'cylinder',top_radius:0,bottom_radius:0,height:2}}).success).toBe(false);
    expect(Collision3dSetShapeSchema.safeParse({node_path:'/Main/Collision',shape:{kind:'capsule',radius:1,height:2}}).success).toBe(true);
  });

  it('validates prospective camera, light and StandardMaterial3D values',()=>{
    expect(Camera3dConfigureSchema.safeParse({node_path:'/Main/Camera',near:10,far:5}).success).toBe(false);
    expect(Camera3dConfigureSchema.safeParse({node_path:'/Main/Camera',projection:'frustum',size:4,near:.1,far:100,frustum_offset:{x:.2,y:0}}).success).toBe(true);
    expect(Light3dConfigureSchema.safeParse({node_path:'/Main/Lamp',energy:-1}).success).toBe(false);
    expect(Material3dConfigureStandardSchema.safeParse({node_path:'/Main/Model',metallic:.5,roughness:.4,cull_mode:'back'}).success).toBe(true);
  });

  it('bounds spatial shader source and canonical uniform values',()=>{
    expect(Shader3dSetCodeSchema.safeParse({node_path:'/Main/Model',code:'shader_type spatial;\nvoid fragment(){ ALBEDO = vec3(1.0); }'}).success).toBe(true);
    expect(Shader3dSetCodeSchema.safeParse({node_path:'/Main/Model',code:'shader_type canvas_item;'}).success).toBe(false);
    expect(Shader3dSetCodeSchema.safeParse({node_path:'/Main/Model',code:'shader_type spatial;'+ 'x'.repeat(65536)}).success).toBe(false);
    expect(Shader3dSetParameterSchema.safeParse({node_path:'/Main/Model',name:'tint',value:{type:'Color',value:{r:1,g:.5,b:.25,a:1}}}).success).toBe(true);
  });
});
