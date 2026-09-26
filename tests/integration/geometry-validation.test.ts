import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { expect, it } from 'vitest';
import { initProject } from '../../packages/cli/src/init/init-project.js';

const scene = `[gd_scene load_steps=4 format=3]
[sub_resource type="RectangleShape2D" id="BlockRect"]
size = Vector2(40, 40)
[sub_resource type="SegmentShape2D" id="UnsupportedSegment"]
a = Vector2(-10, 0)
b = Vector2(10, 0)
[sub_resource type="CircleShape2D" id="Circle"]
radius = 12.0
[node name="Main" type="Node2D"]
[node name="CentralCross" type="Line2D" parent="."]
points = PackedVector2Array(0, 0, 100, 0)
width = 20.0
[node name="academic_block_unidentified" type="StaticBody2D" parent="."]
position = Vector2(50, 0)
[node name="Collision" type="CollisionShape2D" parent="academic_block_unidentified"]
shape = SubResource("BlockRect")
[node name="CircleBlock" type="StaticBody2D" parent="."]
position = Vector2(70, 0)
[node name="Collision" type="CollisionShape2D" parent="CircleBlock"]
shape = SubResource("Circle")
[node name="ClearWalk" type="Line2D" parent="."]
position = Vector2(0, 100)
points = PackedVector2Array(0, 0, 100, 0)
width = 20.0
[node name="NextWalk" type="Line2D" parent="."]
position = Vector2(125, 100)
points = PackedVector2Array(0, 0, 100, 0)
width = 20.0
[node name="TouchWalk" type="Line2D" parent="."]
position = Vector2(0, 30)
points = PackedVector2Array(0, 0, 100, 0)
width = 20.0
[node name="Transformed" type="Node2D" parent="."]
position = Vector2(300, 200)
rotation = 0.785398
scale = Vector2(2, 1.5)
[node name="RotatedWalk" type="Line2D" parent="Transformed"]
points = PackedVector2Array(0, 0, 100, 0)
width = 10.0
[node name="Block" type="StaticBody2D" parent="Transformed"]
position = Vector2(50, 0)
[node name="Collision" type="CollisionShape2D" parent="Transformed/Block"]
shape = SubResource("BlockRect")
[node name="Unsupported" type="StaticBody2D" parent="."]
position = Vector2(50, 100)
[node name="Collision" type="CollisionShape2D" parent="Unsupported"]
shape = SubResource("UnsupportedSegment")
[node name="Plaza" type="Polygon2D" parent="."]
position = Vector2(300, 0)
polygon = PackedVector2Array(0, 0, 120, 0, 120, 80, 0, 80)
[node name="PolygonBlock" type="StaticBody2D" parent="."]
position = Vector2(360, 40)
[node name="CollisionPoly" type="CollisionPolygon2D" parent="PolygonBlock"]
polygon = PackedVector2Array(-15, -15, 15, -15, 15, 15, -15, 15)
`;

it('reports full walkway footprint collisions and endpoint gaps without saving the scene', async () => {
  const godot = process.env.GODOT_BIN;
  if (!godot) throw new Error('GODOT_BIN is required');
  const parent=path.resolve('.godot-mcp/recovery-test-runs');
  await mkdir(parent,{recursive:true});
  const root=await mkdtemp(path.join(parent,'geometry-'));
  await writeFile(path.join(root,'project.godot'),'config_version=5\n[application]\nconfig/name="Geometry fixture"\nrun/main_scene="res://main.tscn"\n');
  await writeFile(path.join(root,'main.tscn'),scene);
  await initProject({projectRoot:root,godotBin:godot,enable:true});
  const original=await readFile(path.join(root,'main.tscn'));
  const client=new Client({name:'geometry-validation-test',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/server/dist/index.js'),'--project',root,'--bridge-port','0']});
  let editor:ChildProcess|undefined;
  let errors='';
  const call=async(args:Record<string,unknown>)=>{
    const result=await client.callTool({name:'geometry.validate_walkways',arguments:args});
    expect(result.isError,JSON.stringify(result)+errors).not.toBe(true);
    return result.structuredContent as any;
  };
  try{
    await client.connect(transport);
    editor=spawn(godot,['--headless','--path',root,'--editor','res://main.tscn'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    editor.stdout!.on('data',()=>{});
    editor.stderr!.on('data',chunk=>errors=(errors+chunk).slice(-20000));
    let ready=false;
    for(let i=0;i<300;i++){
      const status=await client.callTool({name:'session.status',arguments:{}});
      if(status.structuredContent?.editorConnected){
        const tree=await client.callTool({name:'scene.get_tree',arguments:{}});
        if(tree.structuredContent?.root){ready=true;break;}
      }
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    expect(ready,errors).toBe(true);
    const block='/Main/academic_block_unidentified/Collision';
    const crossing=await call({routes:['/Main/CentralCross'],obstacles:[block]});
    expect(crossing).toMatchObject({complete:true,clear:false});
    expect(crossing.findings).toEqual(expect.arrayContaining([expect.objectContaining({
      code:'PATH_COLLISION',routePath:'/Main/CentralCross',obstaclePath:block,
      overlapAreaPx2:expect.any(Number),point:expect.objectContaining({x:expect.any(Number),y:expect.any(Number)})
    })]));
    expect(crossing.findings[0].overlapAreaPx2).toBeGreaterThan(0);

    const clear=await call({routes:['/Main/ClearWalk'],obstacles:[block]});
    expect(clear).toMatchObject({complete:true,clear:true,findings:[]});
    const transformed=await call({routes:['/Main/Transformed/RotatedWalk'],obstacles:['/Main/Transformed/Block/Collision']});
    expect(transformed.findings[0].code).toBe('PATH_COLLISION');
    expect(transformed.findings[0].point.x).toBeGreaterThan(300);
    const polygon=await call({routes:['/Main/Plaza'],obstacles:['/Main/PolygonBlock/CollisionPoly']});
    expect(polygon).toMatchObject({complete:true,clear:false});
    expect(polygon.findings[0]).toMatchObject({code:'PATH_COLLISION',routePath:'/Main/Plaza',obstaclePath:'/Main/PolygonBlock/CollisionPoly'});
    const circle=await call({routes:['/Main/CentralCross'],obstacles:['/Main/CircleBlock/Collision']});
    expect(circle.findings[0]).toMatchObject({code:'PATH_COLLISION',approximate:true});
    expect(circle.approximateObstacles).toContain('/Main/CircleBlock/Collision');
    const bounded=await call({routes:['/Main/CentralCross'],obstacles:[block,'/Main/CircleBlock/Collision'],max_findings:1});
    expect(bounded).toMatchObject({complete:false,clear:false,truncated:true});

    const disconnected=await call({routes:['/Main/ClearWalk','/Main/NextWalk'],obstacles:[block],connections:[{
      from:'/Main/ClearWalk',from_end:'end',to:'/Main/NextWalk',to_end:'start',max_gap_px:10
    }]});
    expect(disconnected.findings).toEqual(expect.arrayContaining([expect.objectContaining({
      code:'CONNECTION_GAP',distancePx:25
    })]));
    const connected=await call({routes:['/Main/ClearWalk','/Main/NextWalk'],obstacles:[block],connections:[{
      from:'/Main/ClearWalk',from_end:'end',to:'/Main/NextWalk',to_end:'start',max_gap_px:30
    }]});
    expect(connected).toMatchObject({complete:true,clear:true});

    const touching=await call({routes:['/Main/TouchWalk'],obstacles:[block],agent_radius_px:1});
    expect(touching.findings.some((finding:any)=>finding.code==='PATH_COLLISION')).toBe(true);
    const unsupported=await call({routes:['/Main/ClearWalk'],obstacles:['/Main/Unsupported/Collision']});
    expect(unsupported).toMatchObject({complete:false,clear:false});
    expect(unsupported.diagnostics.some((item:any)=>item.code==='UNSUPPORTED_SHAPE')).toBe(true);
    expect(await readFile(path.join(root,'main.tscn'))).toEqual(original);
  }finally{
    await client.close();
    if(editor&&editor.exitCode===null&&editor.signalCode===null){
      const exited=once(editor,'exit');
      editor.kill();
      await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,2000))]);
      if(editor.exitCode===null&&editor.signalCode===null)editor.kill('SIGKILL');
    }
  }
},60000);
