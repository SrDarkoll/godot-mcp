import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {expect,it} from 'vitest';
import {initProject} from '../../packages/cli/src/init/init-project.js';
import {confirmFixtureOperation} from './helpers/confirm-fixture-operation.js';

it('imports resources and reports bounded dependency graphs, broken references and inbound impact',async()=>{
 const godot=process.env.GODOT_BIN;if(!godot)throw new Error('GODOT_BIN required');
 const parent=path.resolve('.godot-mcp/recovery-test-runs');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'dependencies-'));
 await fs.writeFile(path.join(root,'project.godot'),'config_version=5\n[application]\nconfig/name="Dependency fixture"\nrun/main_scene="res://main.tscn"\n');
 await fs.writeFile(path.join(root,'shared.tres'),'[gd_resource type="Gradient" format=3]\n[resource]\ncolors=PackedColorArray(1,0,0,1)\n');
 await fs.writeFile(path.join(root,'material.tres'),'[gd_resource type="GradientTexture1D" load_steps=2 format=3]\n[ext_resource type="Gradient" path="res://shared.tres" id="1"]\n[resource]\ngradient=ExtResource("1")\n');
 await fs.writeFile(path.join(root,'main.tscn'),'[gd_scene load_steps=2 format=3]\n[ext_resource type="Texture2D" path="res://material.tres" id="1"]\n[node name="Main" type="Node2D"]\n');
 await fs.writeFile(path.join(root,'broken.tres'),'[gd_resource type="GradientTexture1D" load_steps=2 format=3]\n[ext_resource type="Gradient" path="res://missing.tres" id="1"]\n[resource]\ngradient=ExtResource("1")\n');
 await fs.writeFile(path.join(root,'icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>');
 await initProject({projectRoot:root,godotBin:godot,enable:true});
 const client=new Client({name:'dependency-test',version:'1'},{capabilities:{elicitation:{form:{}}}});const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/server/dist/index.js'),'--project',root,'--bridge-port','0']});
 let editor:ChildProcess|undefined;let errors='';
 const call=async(name:string,args:Record<string,unknown>={})=>{const r=await client.callTool({name,arguments:args});expect(r.isError,JSON.stringify(r)+errors).not.toBe(true);return r.structuredContent as any;};
 try{
  await client.connect(transport);editor=spawn(godot,['--headless','--path',root,'--editor','res://main.tscn'],{windowsHide:true,stdio:['ignore','pipe','pipe']});editor.stdout!.on('data',()=>{});editor.stderr!.on('data',d=>errors=(errors+d).slice(-20000));
  for(let i=0;i<300;i++){if((await call('session.status')).editorConnected)break;await new Promise(r=>setTimeout(r,50));}
  const graph=await call('resource.dependencies',{path:'res://main.tscn',recursive:true,max_nodes:20,max_depth:8});
  expect(graph.complete).toBe(true);expect(graph.nodes.map((n:any)=>n.path)).toEqual(expect.arrayContaining(['res://main.tscn','res://material.tres','res://shared.tres']));
  expect(graph.broken).toEqual([]);
  const broken=await call('resource.dependencies',{path:'res://broken.tres',recursive:true});
  expect(broken.broken).toContain('res://missing.tres');
  const impact=await call('resource.impact',{path:'res://shared.tres',action:'delete',max_files:100});
  expect(impact.safe).toBe(false);expect(impact.inbound.map((n:any)=>n.path)).toContain('res://material.tres');
  const outside=await fs.mkdtemp(path.join(parent,'dependency-outside-'));await fs.writeFile(path.join(outside,'outside.tres'),'[gd_resource type="Resource" format=3]\n');await fs.symlink(outside,path.join(root,'linked'),'junction');
  const linked=await call('resource.impact',{path:'res://shared.tres',action:'delete',max_files:100});expect(linked.linksSkipped).toBe(1);expect(linked.warnings).toContain('LINKS_SKIPPED');
  const truncatedImpact=await call('resource.impact',{path:'res://shared.tres',action:'delete',max_files:1});expect(truncatedImpact).toMatchObject({complete:false,safe:false});expect(truncatedImpact.warnings).toContain('SCAN_TRUNCATED');
  const importedResult=await confirmFixtureOperation(client,'editor.import_resources',{paths:['res://icon.svg'],timeout_ms:15000});expect(importedResult.isError,JSON.stringify(importedResult)+errors).not.toBe(true);const imported=importedResult.structuredContent as any;
  expect(imported).toMatchObject({complete:true,requested:['res://icon.svg']});expect(imported.results[0].valid).toBe(true);
  const page=await call('project.events',{wait_ms:2000});expect(page.events.some((e:any)=>e.event==='import.finished')).toBe(true);
  const bounded=await call('resource.dependencies',{path:'res://main.tscn',recursive:true,max_nodes:1,max_depth:8});expect(bounded.complete).toBe(false);expect(bounded.truncated).toBe(true);
 }finally{await client.close();if(editor&&editor.exitCode===null&&editor.signalCode===null){const exited=once(editor,'exit');editor.kill();await Promise.race([exited,new Promise(r=>setTimeout(r,2000))]);if(editor.exitCode===null&&editor.signalCode===null)editor.kill('SIGKILL');}}
},45000);
