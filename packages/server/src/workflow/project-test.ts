import type {WorkflowProjectTestParams,WorkflowProjectTestResult} from '@godot-mcp/protocol';
import type {RuntimeService} from '../runtime/runtime-service.js';
import {BridgeRpcError} from '../bridge/rpc-router.js';

export const uncheckedProjectTest=():WorkflowProjectTestResult=>({status:'not_checked',nodePath:null,property:null,fieldPath:[],value:null,timedOut:false,elapsedMs:0,error:null});

function plain(value:unknown,depth=0):any{
  if(depth>12)return null;
  if(Array.isArray(value))return value.map(item=>plain(item,depth+1));
  if(!value||typeof value!=='object')return value;
  const item=value as Record<string,unknown>;
  if(typeof item.type==='string'&&Object.hasOwn(item,'value')){
    if(item.type==='Dictionary'&&Array.isArray(item.value)){
      const result:Record<string,unknown>=Object.create(null);
      for(const entry of item.value){if(entry&&typeof entry==='object'){const pair=entry as any;result[String(plain(pair.key,depth+1))]=plain(pair.value,depth+1);}}
      return result;
    }
    return plain(item.value,depth+1);
  }
  const result:Record<string,unknown>=Object.create(null);
  for(const [key,child] of Object.entries(item))result[key]=plain(child,depth+1);
  return result;
}

async function bounded<T>(promise:Promise<T>,timeout:number):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise,new Promise<T>((_resolve,reject)=>{timer=setTimeout(()=>reject(new BridgeRpcError('TIMEOUT','Project test observation reached its deadline')),Math.max(1,timeout));})]);}
  finally{if(timer)clearTimeout(timer);}
}

export async function pollProjectTest(runtime:Pick<RuntimeService,'request'>,contract:WorkflowProjectTestParams):Promise<WorkflowProjectTestResult>{
  const start=Date.now(),deadline=start+contract.timeout_ms;
  let observed=false,value:unknown=null,error:WorkflowProjectTestResult['error']=null;
  const result=(status:WorkflowProjectTestResult['status'],timedOut=false):WorkflowProjectTestResult=>({status,nodePath:contract.node_path,property:contract.property,fieldPath:contract.field_path,
    value:value===undefined?null:value as any,timedOut,elapsedMs:Date.now()-start,error});
  do{
    try{
      const remaining=Math.max(1,deadline-Date.now());
      const response=await bounded(runtime.request('runtime.get_property',{node_path:contract.node_path,property:contract.property},remaining),remaining);
      value=plain(response?.value);error=null;
      for(const key of contract.field_path){value=value&&typeof value==='object'&&Object.hasOwn(value,key)?(value as any)[key]:undefined;}
      if(value===undefined){error={code:'PROJECT_TEST_FIELD_MISSING',message:'Configured report field is not available'};}
      else{
        observed=true;
        if(JSON.stringify(value)===JSON.stringify(contract.pass_value))return result('pass');
        if(JSON.stringify(value)===JSON.stringify(contract.fail_value))return result('fail');
      }
    }catch(cause){
      if(!(cause instanceof BridgeRpcError))throw cause;
      error={code:cause.code,message:cause.message.slice(0,512)};
      if(!['NODE_NOT_FOUND','PROPERTY_NOT_FOUND','RUNTIME_NOT_CONNECTED','TIMEOUT'].includes(cause.code))return result('unavailable');
    }
    const remaining=deadline-Date.now();if(remaining<=0)break;
    await new Promise(resolve=>setTimeout(resolve,Math.min(100,remaining)));
  }while(Date.now()<deadline);
  return result(observed?'pending':'unavailable',true);
}
