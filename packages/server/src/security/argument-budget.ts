import {BridgeRpcError} from '../bridge/rpc-router.js';
/** Bound work before recursive canonicalization or native argument decoding. */
export function validateArgumentBudget(input:unknown):void{
 const stack:Array<{value:unknown;depth:number;exit?:boolean}>=[{value:input,depth:0}];
 const active=new WeakSet<object>();let items=0,bytes=0;
 const fail=()=>{throw new BridgeRpcError('ARGUMENT_TOO_LARGE','Arguments exceed JSON depth, item, byte or cycle limits');};
 while(stack.length){
  const entry=stack.pop()!;const value=entry.value;
  if(entry.exit){active.delete(value as object);continue;}
  if(++items>50000||entry.depth>64)fail();
  if(typeof value==='string')bytes+=Buffer.byteLength(value);
  else if(value&&typeof value==='object'){
   if(active.has(value))fail();active.add(value);stack.push({value,depth:entry.depth,exit:true});
   if(Array.isArray(value)){
    if(value.length>50000-items)fail();
    for(let i=value.length-1;i>=0;i--)stack.push({value:value[i],depth:entry.depth+1});
   }else{
    const keys=Object.keys(value);if(keys.length>50000-items)fail();
    for(const key of keys){bytes+=Buffer.byteLength(key);stack.push({value:(value as Record<string,unknown>)[key],depth:entry.depth+1});}
   }
  }
  if(bytes>8*1024*1024)fail();
 }
}
