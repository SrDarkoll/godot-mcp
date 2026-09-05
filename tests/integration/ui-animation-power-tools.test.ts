import {spawn,type ChildProcess} from 'node:child_process';
import {cp,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {afterEach,describe,expect,test} from 'vitest';
import {initProject} from '../../packages/cli/src/init/init-project.js';
import {confirmFixtureOperation} from './helpers/confirm-fixture-operation.js';

const fixtureRoot=path.resolve('fixtures/empty-project');
const tempRoots:string[]=[];

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

describe('Godot UI and animation power tools',()=>{
  test('builds persistent UI layout and AnimationPlayer tracks through specialized MCP tools',async()=>{
    const godotBin=process.env.GODOT_BIN;
    if(!godotBin) throw new Error('GODOT_BIN must be set by scripts/run-integration.mjs');

    const tempRoot=await mkdtemp(path.join(os.tmpdir(),'godot-mcp-ui-animation-'));
    tempRoots.push(tempRoot);
    await cp(fixtureRoot,tempRoot,{recursive:true});
    await initProject({projectRoot:tempRoot,godotBin,enable:true});

    const serverEntry=path.resolve('packages/server/dist/index.js');
    const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry,'--project',tempRoot,'--bridge-port','0']});
    const client=new Client({name:'ui-animation-integration-test',version:'0.1.0'},{capabilities:{elicitation:{form:{}}}});
    await client.connect(transport);
    let godot:ChildProcess|null=null;

    const call=(name:string,args:Record<string,unknown>={})=>client.callTool({name,arguments:args});
    try{
      godot=spawn(godotBin,['--headless','--path',tempRoot,'--editor','res://main.tscn'],{stdio:'inherit',windowsHide:true});
      expect(await waitFor(async()=>((await call('session.status')).structuredContent as any)?.editorConnected===true,15000)).toBe(true);
      expect(await waitFor(async()=>!!((await call('scene.get_tree')).structuredContent as any)?.root,10000)).toBe(true);

      for(const [parent_path,type,name] of [
        ['/Main','Control','HUD'],
        ['/Main/HUD','VBoxContainer','Menu'],
        ['/Main/HUD/Menu','Button','PlayButton'],
        ['/Main/HUD/Menu','Button','QuitButton'],
        ['/Main','AnimationPlayer','AnimationPlayer']
      ] as const){
        const created=await call('node.create',{parent_path,type,name});
        expect(created.isError,JSON.stringify(created.structuredContent)).not.toBe(true);
      }

      const preset=await call('ui.set_layout_preset',{node_path:'/Main/HUD',preset:'full_rect'});
      expect(preset.isError,JSON.stringify(preset.structuredContent)).not.toBe(true);
      expect((preset.structuredContent as any).layout.anchors).toEqual({left:0,top:0,right:1,bottom:1});

      const menuPreset=await call('ui.set_layout_preset',{node_path:'/Main/HUD/Menu',preset:'center',resize_mode:'keep_size'});
      expect(menuPreset.isError).not.toBe(true);
      const flags=await call('ui.set_size_flags',{
        node_path:'/Main/HUD/Menu/PlayButton',horizontal:['fill','expand'],vertical:['shrink_center'],stretch_ratio:2
      });
      expect(flags.isError,JSON.stringify(flags.structuredContent)).not.toBe(true);
      expect((flags.structuredContent as any).layout).toMatchObject({
        container_managed:true,
        size_flags_horizontal:expect.arrayContaining(['fill','expand']),
        size_flags_vertical:['shrink_center'],
        size_flags_stretch_ratio:2
      });

      const focus=await call('ui.set_focus_neighbor',{node_path:'/Main/HUD/Menu/PlayButton',side:'right',neighbor_path:'/Main/HUD/Menu/QuitButton'});
      expect(focus.isError).not.toBe(true);
      expect((focus.structuredContent as any).layout.focus_neighbors.right).toBe('/Main/HUD/Menu/QuitButton');
      const focusClear=await call('ui.set_focus_neighbor',{node_path:'/Main/HUD/Menu/PlayButton',side:'right',neighbor_path:null});
      expect(focusClear.isError,JSON.stringify(focusClear.structuredContent)).not.toBe(true);
      expect((focusClear.structuredContent as any).layout.focus_neighbors.right).toBeNull();

      const offset=await call('ui.set_offsets',{node_path:'/Main/HUD',left:12});
      expect((offset.structuredContent as any).layout.offsets.left).toBe(12);
      expect((await confirmFixtureOperation(client,'editor.undo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('ui.inspect_layout',{node_path:'/Main/HUD'})).structuredContent as any).offsets.left).toBe(0);
      expect((await confirmFixtureOperation(client,'editor.redo',{})).structuredContent).toMatchObject({performed:true});
      expect(((await call('ui.inspect_layout',{node_path:'/Main/HUD'})).structuredContent as any).offsets.left).toBe(12);

      const createdAnimation=await call('animation.create',{
        player_path:'/Main/AnimationPlayer',animation:'fade',length:0.5,step:0.1,loop_mode:'none'
      });
      expect(createdAnimation.isError,JSON.stringify(createdAnimation.structuredContent)).not.toBe(true);
      expect(createdAnimation.structuredContent).toMatchObject({player_path:'/Main/AnimationPlayer',animation:'fade',qualified_name:'fade'});

      const track=await call('animation.add_track',{
        player_path:'/Main/AnimationPlayer',animation:'fade',type:'value',path:'HUD:modulate:a',interpolation:'linear'
      });
      expect(track.isError,JSON.stringify(track.structuredContent)).not.toBe(true);
      expect((track.structuredContent as any).track_index).toBe(0);

      for(const [time,value] of [[0,0],[0.5,1]] as const){
        const key=await call('animation.insert_key',{
          player_path:'/Main/AnimationPlayer',animation:'fade',track_index:0,time,value:{type:'float',value},transition:1
        });
        expect(key.isError,JSON.stringify(key.structuredContent)).not.toBe(true);
      }

      const inspected=await call('animation.inspect',{player_path:'/Main/AnimationPlayer',animation:'fade'});
      expect(inspected.isError,JSON.stringify(inspected.structuredContent)).not.toBe(true);
      expect(inspected.structuredContent).toMatchObject({
        player_path:'/Main/AnimationPlayer',animation:'fade',length:0.5,loop_mode:'none',step:0.1,track_count:1
      });
      const inspectedTrack=(inspected.structuredContent as any).tracks[0];
      expect(inspectedTrack).toMatchObject({type:'value',path:'HUD:modulate:a',interpolation:'linear'});
      expect(inspectedTrack.keys).toHaveLength(2);
      expect(inspectedTrack.keys[0].value).toEqual({type:'float',value:0});
      expect(inspectedTrack.keys[1].value).toEqual({type:'float',value:1});

      expect((await call('scene.save')).structuredContent).toMatchObject({saved:true});
      expect((await confirmFixtureOperation(client,'scene.reload',{})).structuredContent).toMatchObject({reloaded:true});

      const persistedUi=await call('ui.inspect_layout',{node_path:'/Main/HUD'});
      expect(persistedUi.isError).not.toBe(true);
      expect((persistedUi.structuredContent as any)).toMatchObject({anchors:{left:0,top:0,right:1,bottom:1},offsets:{left:12}});
      const persistedAnimation=await call('animation.inspect',{player_path:'/Main/AnimationPlayer',animation:'fade'});
      expect(persistedAnimation.isError,JSON.stringify(persistedAnimation.structuredContent)).not.toBe(true);
      expect((persistedAnimation.structuredContent as any).tracks[0].keys).toHaveLength(2);

      const badUi=await call('ui.inspect_layout',{node_path:'/Main/Player'});
      expect(badUi.isError).toBe(true);
      expect(badUi.structuredContent).toMatchObject({error:{code:'INVALID_NODE_TYPE'}});
      const badAnimation=await call('animation.list',{player_path:'/Main/Player'});
      expect(badAnimation.isError).toBe(true);
      expect(badAnimation.structuredContent).toMatchObject({error:{code:'INVALID_NODE_TYPE'}});
    }finally{
      await client.close().catch(()=>undefined);
      await stopProcess(godot);
    }
  },60000);
});
