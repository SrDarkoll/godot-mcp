import * as z from 'zod/v4';import {TransactionBeginSchema,RecoveryPathSchema,RecoveryPathsSchema} from '@godot-mcp/protocol';
import type {ToolRegistrar} from '../security/tool-registrar.js';import type {RecoveryService} from '../recovery/recovery-service.js';import {BridgeRpcError,type RpcRouter} from '../bridge/rpc-router.js';import {toolSuccess,toolError} from '../mcp/tool-result.js';
export function registerRecoveryTools(server:ToolRegistrar,recovery:RecoveryService,rpc:Pick<RpcRouter,'call'>):void{
 const id=z.string().uuid();const session=z.string().regex(/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z_[a-f0-9]{8}$/);
 const register=(name:string,inputSchema:z.ZodObject<any>,handler:(args:any)=>Promise<object>)=>server.registerTool(name,{description:`${name}: declared on-disk file recovery with retained snapshots.`,inputSchema},async args=>{try{return toolSuccess(await handler(args));}catch(error){return toolError(error);}});
 register('transaction.begin',TransactionBeginSchema,args=>recovery.begin(args));
 register('transaction.write_file',z.strictObject({transaction_id:id,path:RecoveryPathSchema,content:z.string().max(4*1024*1024)}),a=>recovery.write(a.transaction_id,a.path,a.content));
 register('transaction.delete_file',z.strictObject({transaction_id:id,path:RecoveryPathSchema}),a=>recovery.remove(a.transaction_id,a.path));
 register('transaction.preview',z.strictObject({transaction_id:id}),a=>recovery.preview(a.transaction_id));
 server.registerTool('transaction.commit',{description:'Publish and validate staged files; failed validation triggers exact-byte compensation.',inputSchema:z.strictObject({transaction_id:id})},async a=>{try{const result=await recovery.commit(a.transaction_id);return {...toolSuccess(result),...(result.state==='rolled_back'&&result.validation?.valid===false?{isError:true}:{})};}catch(e){return toolError(e);}});
 register('transaction.rollback',z.strictObject({transaction_id:id}),a=>recovery.rollback(a.transaction_id));
 register('transaction.recover',z.strictObject({transaction_id:id,session_id:session,force:z.boolean().default(false)}),a=>recovery.recover(a.session_id,a.transaction_id,a.force));
 register('transaction.status',z.strictObject({transaction_id:id.optional(),session_id:session.optional()}),a=>recovery.status(a.transaction_id,a.session_id));
 register('checkpoint.create',z.strictObject({label:z.string().trim().min(1).max(120),paths:RecoveryPathsSchema}),a=>recovery.createCheckpoint(a.label,a.paths));
 register('checkpoint.list',z.strictObject({session_id:session.optional()}),async a=>({checkpoints:await recovery.listCheckpoints(a.session_id)}));
 register('checkpoint.inspect',z.strictObject({checkpoint_id:id,session_id:session.optional()}),a=>recovery.inspectCheckpoint(a.checkpoint_id,a.session_id));
 register('checkpoint.restore',z.strictObject({checkpoint_id:id,session_id:session.optional()}),a=>recovery.restoreCheckpoint(a.checkpoint_id,a.session_id));
 server.registerTool('editor.close_scene',{
  description:'Save and close the active named scene without discarding changes. Explicit discard_changes requires approval; unnamed scenes must be saved first.',
  inputSchema:z.strictObject({discard_changes:z.boolean().optional()})
 },async args=>{
  try{
   if(args.discard_changes!==true){
    // Older addons silently ignored close parameters and discarded editor work.
    const state=await rpc.call('recovery.editor_state',{}) as Record<string,unknown>;
    if(!state||state.safeCloseSupported!==true)throw new BridgeRpcError('CAPABILITY_UNAVAILABLE','Update the Godot addon before using save-before-close; no scene was closed.');
   }
   return toolSuccess(await rpc.call('editor.close_scene',args) as object);
  }catch(error){return toolError(error);}
 });
}
