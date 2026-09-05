import {spawn} from 'node:child_process';
export async function runCommand(executable:string,args:string[],options:{timeoutMs:number;maxOutputBytes:number}):Promise<{code:number|null;stdout:string;stderr:string}>{
 return await new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{windowsHide:true});
  let stdout='';let stderr='';let bytes=0;let settled=false;
  const fail=(code:string,message:string)=>{if(settled)return;settled=true;clearTimeout(timer);child.kill();reject(Object.assign(new Error(message),{code}));};
  const timer=setTimeout(()=>fail('PROCESS_TIMEOUT','Configured executable exceeded its time limit'),options.timeoutMs);
  child.stdin.end();child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  const append=(text:string,error:boolean)=>{bytes+=Buffer.byteLength(text);if(bytes>options.maxOutputBytes){fail('PROCESS_OUTPUT_LIMIT','Configured executable exceeded its output limit');return;}if(error)stderr+=text;else stdout+=text;};
  child.stdout.on('data',text=>append(text,false));child.stderr.on('data',text=>append(text,true));
  child.once('error',()=>fail('PROCESS_START_FAILED','Unable to start the configured executable'));
  child.once('close',code=>{if(settled)return;settled=true;clearTimeout(timer);resolve({code,stdout,stderr});});
 });
}
