import fs from 'node:fs/promises';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {DEFAULT_PERMISSIONS,PermissionSchema,type Permission,type Risk} from '@godot-mcp/protocol';
import type {Session} from '../session/session.js';import type {SessionStore} from '../session/session-store.js';import type {RecoveryService} from '../recovery/recovery-service.js';
import {BridgeRpcError} from '../bridge/rpc-router.js';import {OperationGate} from './operation-gate.js';
const READS=new Set(['session.status','session.manifest','project.info','scene.get_tree','scene.get_root','node.inspect','node.list_children','node.get_property','node.get_properties','object.get_class','object.get_property_list','object.get_method_list','object.get_signal_list','object.get','resource.load','resource.inspect','script.inspect','script.validate','signal.list','signal.connections','project.settings.get','project.input.list','editor.get_active_scene','editor.get_open_scenes','editor.get_selected_nodes','editor.get_filesystem','runtime.status','runtime.scene_tree','runtime.inspect_node','runtime.get_property','debug.output','debug.errors','debug.warnings','debug.performance','permissions.status','risk.preview','transaction.status','transaction.preview','checkpoint.list','checkpoint.inspect']);
const CONTROLS=new Set(['runtime.status','runtime.stop','project.stop','session.status','permissions.status','transaction.status','debug.output','debug.errors','debug.warnings']);
const NORMAL_MUTATIONS=new Set(['node.create','node.delete','node.duplicate','node.rename','node.reparent','node.move','node.set_property','object.set','scene.create','scene.open','scene.save','scene.instantiate','resource.create','resource.save','resource.duplicate','resource.set_property','script.create','script.attach','script.detach','signal.connect','signal.disconnect','project.input.add_action','project.input.remove_action','editor.select_node','editor.change_scene','editor.undo','editor.redo','editor.scan_filesystem','project.run','project.run_scene','runtime.pause','runtime.resume','runtime.restart','visual.capture_game','visual.capture_viewport_2d','visual.capture_viewport_3d','transaction.begin','transaction.write_file','transaction.delete_file','transaction.rollback','checkpoint.create','permissions.set','permissions.enable','permissions.disable']);
const LOCAL=(name:string)=>/^(transaction|checkpoint|permissions|risk)\./.test(name)||name.startsWith('session.')||/^debug\.(output|errors|warnings)$/.test(name);
const blockedMethod=(args:Record<string,unknown>)=>{const method=String(args.method??'').trim();return method.startsWith('_')||['free','queue_free','crash','execute','create_process','kill','shell_open','open_shell'].includes(method);};
function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(value)??'null';}
interface Assessment {risk:Risk;targets:string[];fingerprint:string;permissions:Permission[];}
export class ToolPolicy {
 private closing=false;
 private readonly flags={...DEFAULT_PERMISSIONS};private readonly gate=new OperationGate();
 private readonly confirmations=new Map<string,{fingerprint:string;expires:number}>();private auditQueue:Promise<void>=Promise.resolve();
 constructor(private readonly session:Session,private readonly sessions:SessionStore,private readonly recovery:RecoveryService){}
 permissions():Record<Permission,boolean>{return {...this.flags};}
 private required(name:string,args:Record<string,unknown>):Permission[]{
  const permissions:Permission[]=[];
  if(!LOCAL(name)&&!CONTROLS.has(name))permissions.push('network.local','filesystem.project');
  if(name==='transaction.preview')permissions.push('filesystem.project');
  if(this.recovery.editorConnected&&['transaction.begin','transaction.commit','transaction.recover','checkpoint.restore'].includes(name))permissions.push('network.local');
  if(!READS.has(name)&&!CONTROLS.has(name)&&!name.startsWith('permissions.')){
   if(LOCAL(name)||name.startsWith('visual.'))permissions.push('filesystem.project');
   else if(name.startsWith('runtime.')||name==='project.run'||name==='project.run_scene')permissions.push('runtime.modify','process.godot','filesystem.project');
   else permissions.push('editor.modify','filesystem.project');
  }
  if(['path','resource_path','script_path','source_path','target_path'].some(k=>typeof args[k]==='string')||Array.isArray(args.paths))permissions.push('filesystem.project');
  return [...new Set(permissions)];
 }
 async setPermission(value:Permission,enabled:boolean):Promise<object>{const permission=PermissionSchema.parse(value);const old=this.flags[permission];await this.sessions.update(this.session.id,m=>({...m,permissionChanges:[...m.permissionChanges,{timestamp:new Date().toISOString(),permission,oldValue:old,newValue:enabled}]}));this.flags[permission]=enabled;return {permission,enabled,scope:'session'};}
 private async audit(tool:string,args:Record<string,unknown>,risk:Risk,outcome:string,targets:string[]):Promise<void>{const entry={id:randomUUID(),timestamp:new Date().toISOString(),tool,risk,outcome,targets,transactionId:this.recovery.activeId,argumentsHash:createHash('sha256').update(canonical(args)).digest('hex')};const task=this.auditQueue.then(async()=>{const dir=await this.sessions.ensureDirectory(this.session.id,'logs');const file=path.join(dir,'audit.jsonl');try{if((await fs.lstat(file)).isSymbolicLink())throw new Error('Linked audit');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}const handle=await fs.open(file,'a');try{await handle.writeFile(JSON.stringify(entry)+'\n');await handle.sync();}finally{await handle.close();}});this.auditQueue=task.catch(()=>{});try{await task;}catch{throw new BridgeRpcError('AUDIT_WRITE_FAILED','Unable to persist audit record');}}
 async assess(name:string,args:Record<string,unknown>):Promise<Assessment>{
  const permissions=this.required(name,args);
  if(permissions.some(p=>!this.flags[p]))return {risk:'blocked',targets:[],permissions,fingerprint:createHash('sha256').update(canonical({name,args,blocked:true})).digest('hex')};
  const targets:string[]=[];const fingerprints:Record<string,string|null>={};
  for(const key of ['path','resource_path','script_path','source_path','target_path'])if(typeof args[key]==='string'&&args[key])targets.push(args[key] as string);
  if(Array.isArray(args.paths))targets.push(...args.paths as string[]);
  if(['project.settings.set','project.input.add_action','project.input.remove_action'].includes(name))targets.push('res://project.godot');
  let extra:unknown=null;
  if(['editor.close_scene','scene.reload','scene.save'].includes(name)){
   const state=await this.recovery.editorState();extra=state;if(typeof state.path==='string'&&state.path)targets.push(state.path);
  }
  if(name==='transaction.commit'||name==='transaction.preview') {const record=await this.recovery.status(String(args.transaction_id));if('id' in record){targets.push(...record.before.map(e=>e.path));extra={revision:record.revision,after:record.after};}}
  if(name==='transaction.recover'){const record=await this.recovery.status(String(args.transaction_id),String(args.session_id));if('id' in record){targets.push(...record.before.map(e=>e.path));extra={revision:record.revision,before:record.before};}}
  if(name==='checkpoint.restore'){const record=await this.recovery.inspectCheckpoint(String(args.checkpoint_id),args.session_id as string|undefined);targets.push(...record.before.map(e=>e.path));extra=record.before;}
  for(const target of new Set(targets)){if(READS.has(name))await this.recovery.files.resolve(target);else fingerprints[target]=await this.recovery.files.fingerprint(target);}
  let risk:Risk=READS.has(name)||NORMAL_MUTATIONS.has(name)||CONTROLS.has(name)?'normal':'risky';
  if(['object.call','scene.reload','editor.close_scene','project.settings.set','transaction.commit','transaction.recover','checkpoint.restore'].includes(name))risk='risky';
  if(['script.create','resource.create','resource.save','scene.create','scene.save_as'].includes(name)&&Object.values(fingerprints).some(v=>v!==null))risk='risky';
  if(name==='resource.duplicate'&&fingerprints[String(args.target_path)]!==null)risk='risky';
  if(name==='scene.save'&&args.path&&extra&&typeof extra==='object'&&'path' in extra&&extra.path!==args.path&&fingerprints[String(args.path)]!==null)risk='risky';
  if(name.startsWith('permissions.')&&(args.enabled===true||name==='permissions.enable')&&DEFAULT_PERMISSIONS[args.permission as Permission]===false)risk='risky';
  if(name==='object.call'&&blockedMethod(args))risk='blocked';
  const displayTargets=[...new Set(targets)];for(const key of ['node_path','parent_path','source_node_path','target_node_path','new_parent_path'])if(typeof args[key]==='string')displayTargets.push(`${key}:${args[key]}`);
  if(!displayTargets.length&&/^(node|object|scene|editor)\./.test(name))displayTargets.push('editor:active_scene');
  return {risk,targets:displayTargets,permissions:[...new Set(permissions)],fingerprint:createHash('sha256').update(canonical({session:this.session.id,name,args,fingerprints,extra})).digest('hex')};
 }
 async execute<T>(name:string,input:Record<string,unknown>,operation:(args:Record<string,unknown>)=>Promise<T>):Promise<T>{
  const {confirmation,...args}=input;
  const execute=async()=>{
   if(this.closing&&!CONTROLS.has(name))throw new BridgeRpcError('SESSION_CLOSED','Session is closing');
   const required=this.required(name,args);
   if(required.some(p=>!this.flags[p])){await this.audit(name,args,'blocked','denied',[]);throw new BridgeRpcError('PERMISSION_DENIED','Required session permission is disabled',{permissions:required});}
   if(name==='object.call'){
    if(blockedMethod(args)){
     await this.audit(name,args,'blocked','denied',[]);throw new BridgeRpcError('SAFETY_VIOLATION','This reflective method is blocked');
    }
   }
   const exempt=LOCAL(name)||CONTROLS.has(name)||name==='editor.close_scene';
   if(!exempt)await this.recovery.requireNoBarrier();
   if(this.recovery.activeId&&!READS.has(name)&&!exempt&&!name.startsWith('visual.'))throw new BridgeRpcError('TRANSACTION_ACTIVE','Only transaction staging or status is allowed while a file transaction is open');
   const assessment=await this.assess(name,args);
   if(assessment.risk==='blocked'){await this.audit(name,args,'blocked','denied',assessment.targets);throw new BridgeRpcError('PERMISSION_DENIED','Required session permission is disabled',{permissions:assessment.permissions});}
   if(assessment.risk==='risky'){
    const stored=typeof confirmation==='string'?this.confirmations.get(confirmation):undefined;
    if(typeof confirmation==='string')this.confirmations.delete(confirmation);
    if(!stored||stored.expires<Date.now()||stored.fingerprint!==assessment.fingerprint){
     for(const [key,value] of this.confirmations)if(value.expires<Date.now())this.confirmations.delete(key);
     if(this.confirmations.size>=128)this.confirmations.delete(this.confirmations.keys().next().value!);
     const token=randomUUID();this.confirmations.set(token,{fingerprint:assessment.fingerprint,expires:Date.now()+300000});
     await this.audit(name,args,'risky','confirmation_required',assessment.targets);
     throw new BridgeRpcError('CONFIRMATION_REQUIRED','Review the operation and resubmit with its confirmation token',{tool:name,targets:assessment.targets,risk:'risky',confirmationToken:token});
    }
   }
   const audited=!READS.has(name);
   if(audited)await this.audit(name,args,assessment.risk,'started',assessment.targets);
   try{const result=await operation(args);if(audited)await this.audit(name,args,assessment.risk,result&&typeof result==='object'&&'isError' in result&&result.isError?'failed':'succeeded',assessment.targets);return result;}catch(error){if(audited)await this.audit(name,args,assessment.risk,'failed',assessment.targets);throw error;}
  };
  return CONTROLS.has(name)?execute():this.gate.run(!READS.has(name),execute);
 }
 async flush():Promise<void>{await this.auditQueue;}
 async close():Promise<void>{this.closing=true;await this.gate.idle();await this.flush();}
}
