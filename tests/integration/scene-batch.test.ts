import {mkdir,mkdtemp,cp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {expect,it} from 'vitest';
import {initProject} from '../../packages/cli/src/init/init-project.js';
import {confirmFixtureOperation} from './helpers/confirm-fixture-operation.js';
import {waitFor} from './helpers/visual-harness.js';
it('prevalidates a scene/resource batch, rejects stale state, and undoes/redoes it as one action',async()=>{
 const godot=process.env.GODOT_BIN;if(!godot)throw new Error('GODOT_BIN required');
 const parent=path.resolve('.godot-mcp/recovery-test-runs');await mkdir(parent,{recursive:true});const root=await mkdtemp(path.join(parent,'batch-'));
 await cp(path.resolve('fixtures/empty-project'),root,{recursive:true});
 await writeFile(path.join(root,'gradient.tres'),'[gd_resource type="Gradient" format=3]\n[resource]\ninterpolation_mode=0\n');
 await initProject({projectRoot:root,godotBin:godot,enable:true});
 const client=new Client({name:'batch-test',version:'1'},{capabilities:{elicitation:{form:{}}}});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/server/dist/index.js'),'--project',root,'--bridge-port','0']});
 let editor:ChildProcess|undefined;let errors='';
 const call=async(name:string,args:Record<string,unknown>={})=>{
  const result=await client.callTool({name,arguments:args});expect(result.isError,JSON.stringify(result)+errors).not.toBe(true);return result.structuredContent as any;
 };
 try{
  await client.connect(transport);
  editor=spawn(godot,['--headless','--path',root,'--editor','res://main.tscn'],{windowsHide:true,stdio:['ignore','pipe','pipe']});editor.stdout!.on('data',()=>{});editor.stderr!.on('data',d=>errors=(errors+d).slice(-20000));
  let ready=false;for(let i=0;i<300;i++){
   if((await call('session.status')).editorConnected){const tree=await call('scene.get_tree');if(tree.root){ready=true;break;}}
   await new Promise(r=>setTimeout(r,50));
  }expect(ready,errors).toBe(true);
  const eventPage=await call('project.events');
  expect(eventPage.events.some((e:any)=>e.event==='editor.connected')).toBe(true);
  // Trigger a transition after the subscription cursor instead of assuming
  // the editor restored its initial scene after the plugin subscribed.
  await writeFile(path.join(root,'event_probe.tscn'),'[gd_scene format=3]\n[node name="EventProbe" type="Node2D"]\n');
  await call('scene.open',{path:'res://event_probe.tscn'});
  await call('scene.open',{path:'res://main.tscn'});
  let cursor=eventPage.nextCursor;const received:any[]=[];
  await waitFor(async()=>{
   const page=await call('project.events',{after:cursor,wait_ms:500});
   expect(page.gap,JSON.stringify(page)).toBe(false);
   received.push(...page.events);cursor=page.nextCursor;
   return received.some(e=>e.event==='scene.changed'&&e.data.path==='res://main.tscn');
  },5000).catch(error=>{throw new Error(`Expected scene.changed for the reopened fixture; received ${JSON.stringify(received)}`,{cause:error});});
  await call('node.create',{parent_path:'/Main',type:'Node2D',name:'Existing'});
  await call('node.create',{parent_path:'/Main',type:'Node2D',name:'ToDelete'});
  await call('node.create',{parent_path:'/Main/ToDelete',type:'Node2D',name:'Nested'});
  const cyclic=await client.callTool({name:'scene.batch.preview',arguments:{operations:[{op:'reparent',node:'/Main/ToDelete',parent:'/Main/ToDelete/Nested'}]}});
  expect(cyclic.isError).toBe(true);expect(JSON.stringify(cyclic)).toContain('BATCH_INVALID_PARENT');
  const ownerBefore=await call('node.get_property',{node_path:'/Main/ToDelete/Nested',property:'owner'});
  const operations=[
   {op:'create',id:'actor',type:'Node2D',name:'Actor',parent:'.'},
   {op:'create',id:'arm',type:'Node2D',name:'Arm',parent:'@actor'},
   {op:'set_property',node:'@actor',property:'position',value:{x:10,y:20}},
   {op:'set_property',node:'@actor',property:'transform',value:{type:'Transform2D',value:{x:{x:1,y:0},y:{x:0,y:1},origin:{x:10,y:20}}}},
   {op:'rename',node:'@actor',name:'BatchPlayer'},
   {op:'reparent',node:'/Main/Existing',parent:'@actor'},
   {op:'move',node:'/Main/Existing',index:0},
   {op:'delete',node:'/Main/ToDelete'},
   {op:'resource_set_property',path:'res://gradient.tres',property:'interpolation_mode',value:1},
  ];
  const preview=await call('scene.batch.preview',{operations,label:'Fixture batch'});
  expect((await call('node.list_children',{node_path:'/Main'})).children.map((n:any)=>n.name)).toEqual(['Player','Existing','ToDelete']);
  await call('node.set_property',{node_path:'/Main/Existing',property:'position',value:{x:1,y:2}});
  const stale=await client.callTool({name:'scene.batch',arguments:{operations,expected:preview.expected}});expect(JSON.stringify(stale)).toContain('BATCH_CONFLICT');
  const invalid=await client.callTool({name:'scene.batch.preview',arguments:{operations:[operations[0],{op:'set_property',node:'@actor',property:'nonexistent',value:1}]}});
  expect(invalid.isError).toBe(true);expect((await call('node.list_children',{node_path:'/Main'})).children).toHaveLength(3);
  const malformed=await client.callTool({name:'scene.batch.preview',arguments:{operations:[operations[0],{op:'set_property',node:'@actor',property:'position',value:{type:'Vector2',value:[]}}]}});
  expect(JSON.stringify(malformed)).toContain('BATCH_VALUE_INVALID');
  const current=await call('scene.batch.preview',{operations,label:'Fixture batch'});
  const applied=await call('scene.batch',{operations,label:'Fixture batch',expected:current.expected});expect(applied.applied).toBe(true);
  expect((await call('node.get_property',{node_path:'/Main/BatchPlayer',property:'position'})).value).toEqual({x:10,y:20});
  expect((await call('node.list_children',{node_path:'/Main/BatchPlayer'})).children.map((n:any)=>n.name)).toEqual(['Existing','Arm']);
  expect((await call('resource.inspect',{path:'res://gradient.tres'})).properties.interpolation_mode).toBe(1);
  const undo = await confirmFixtureOperation(client,'editor.undo',{});
  expect(undo.isError, JSON.stringify(undo)).not.toBe(true);
  expect((await call('node.list_children',{node_path:'/Main'})).children.map((n:any)=>n.name)).toEqual(['Player','Existing','ToDelete']);
  expect(await call('node.get_property',{node_path:'/Main/ToDelete/Nested',property:'owner'})).toEqual(ownerBefore);
  expect((await call('resource.inspect',{path:'res://gradient.tres'})).properties.interpolation_mode).toBe(0);
  const redo = await confirmFixtureOperation(client,'editor.redo',{});
  expect(redo.isError, JSON.stringify(redo)).not.toBe(true);
  expect((await call('node.list_children',{node_path:'/Main'})).children.map((n:any)=>n.name)).toEqual(['Player','BatchPlayer']);
  const rejectedOperations=[{op:'create',id:'probe',type:'Camera2D',name:'RollbackProbe',parent:'.'},{op:'resource_set_property',path:'res://gradient.tres',property:'interpolation_mode',value:2},{op:'set_property',node:'@probe',property:'zoom',value:{x:0,y:0}}];
  const rejectedPreview=await call('scene.batch.preview',{operations:rejectedOperations});
  const rejected=await client.callTool({name:'scene.batch',arguments:{operations:rejectedOperations,expected:rejectedPreview.expected}});
  expect(rejected.isError).toBe(true);
  expect(rejected.structuredContent).toMatchObject({error:{details:{rollbackVerified:true}}});
  expect((await call('node.list_children',{node_path:'/Main'})).children.map((n:any)=>n.name)).toEqual(['Player','BatchPlayer']);
  expect((await call('resource.inspect',{path:'res://gradient.tres'})).properties.interpolation_mode).toBe(1);
  await call('node.create',{parent_path:'/Main',type:'Polygon2D',name:'Walkway'});
  await call('node.create',{parent_path:'/Main',type:'Line2D',name:'WalkwayEdge'});
  const points=[{x:0,y:0},{x:32,y:0},{x:32,y:32}];
  for(const [node,property] of [['/Main/Walkway','polygon'],['/Main/WalkwayEdge','points']]){
    const plain=await client.callTool({name:'scene.batch.preview',arguments:{operations:[{op:'set_property',node,property,value:points}]}});
    expect(plain.structuredContent).toMatchObject({error:{code:'BATCH_TYPE_MISMATCH',details:{
      property,expectedType:'PackedVector2Array',receivedType:'Array',
      example:{type:'PackedVector2Array',value:points}
    }}});
  }
  const polygonOperations=[
    {op:'set_property',node:'/Main/Walkway',property:'polygon',value:{type:'PackedVector2Array',value:points}},
    {op:'set_property',node:'/Main/WalkwayEdge',property:'points',value:{type:'PackedVector2Array',value:points}}
  ];
  const polygonPreview=await call('scene.batch.preview',{operations:polygonOperations});
  expect((await call('scene.batch',{operations:polygonOperations,expected:polygonPreview.expected})).applied).toBe(true);
  expect(JSON.stringify(await call('node.get_property',{node_path:'/Main/Walkway',property:'polygon'}))).toContain('32');
  expect(JSON.stringify(await call('node.get_property',{node_path:'/Main/WalkwayEdge',property:'points'}))).toContain('32');
  const polygonUndo=await confirmFixtureOperation(client,'editor.undo',{});
  expect(polygonUndo.isError).not.toBe(true);
  expect(JSON.stringify(await call('node.get_property',{node_path:'/Main/Walkway',property:'polygon'}))).not.toContain('32');
  expect(JSON.stringify(await call('node.get_property',{node_path:'/Main/WalkwayEdge',property:'points'}))).not.toContain('32');
 }finally{
  await client.close();
  if(editor&&editor.exitCode===null&&editor.signalCode===null){const exited=once(editor,'exit');editor.kill();await Promise.race([exited,new Promise(r=>setTimeout(r,2000))]);if(editor.exitCode===null&&editor.signalCode===null)editor.kill('SIGKILL');}
 }
},45000);
