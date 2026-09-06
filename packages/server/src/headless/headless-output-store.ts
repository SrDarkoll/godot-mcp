import fs from 'node:fs/promises';
import path from 'node:path';
import { HeadlessOutputEntrySchema, MAX_HEADLESS_OUTPUT_BYTES, type HeadlessOutputEntry } from '@godot-mcp/protocol';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import type { Session } from '../session/session.js';
import type { SessionStore } from '../session/session-store.js';

interface OutputState {sequence:number;bytes:number;truncated:boolean;}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedPrefix(text:string,maxBytes:number):{text:string;bytes:number}{
  if(maxBytes<=0)return {text:'',bytes:0};
  let out='';let bytes=0;
  for(const char of text){
    const size=Buffer.byteLength(char,'utf8');
    if(bytes+size>maxBytes)break;
    out+=char;bytes+=size;
  }
  return {text:out,bytes};
}

export class HeadlessOutputStore {
  private readonly state=new Map<string,OutputState>();
  private queue:Promise<void>=Promise.resolve();
  constructor(private readonly session:Session,private readonly sessions:SessionStore){}

  private validateId(executionId:string):void{
    if(!UUID.test(executionId))throw new BridgeRpcError('HEADLESS_OUTPUT_FAILED','Invalid headless execution id');
  }

  private async file(executionId:string):Promise<string>{
    this.validateId(executionId);
    const dir=await this.sessions.ensureDirectory(this.session.id,'logs/headless');
    return path.join(dir,`${executionId}.jsonl`);
  }

  async append(executionId:string,stream:'stdout'|'stderr',text:string):Promise<{acceptedBytes:number;truncated:boolean}>{
    this.validateId(executionId);
    let result={acceptedBytes:0,truncated:false};
    const task=this.queue.then(async()=>{
      const current=this.state.get(executionId) ?? {sequence:0,bytes:0,truncated:false};
      const remaining=Math.max(0,MAX_HEADLESS_OUTPUT_BYTES-current.bytes);
      const accepted=boundedPrefix(String(text),remaining);
      const truncated=current.truncated || accepted.bytes<Buffer.byteLength(String(text),'utf8');
      if(accepted.bytes===0){
        current.truncated=truncated;
        this.state.set(executionId,current);
        result={acceptedBytes:0,truncated};
        return;
      }
      const file=await this.file(executionId);
      try {
        try {
          const stat=await fs.lstat(file);
          if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1)throw new Error('Linked headless log');
        } catch(error) {
          if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
        }
        const entry=HeadlessOutputEntrySchema.parse({sequence:current.sequence+1,timestamp:new Date().toISOString(),stream,text:accepted.text});
        const handle=await fs.open(file,'a');
        try { await handle.writeFile(`${JSON.stringify(entry)}\n`); await handle.sync(); }
        finally { await handle.close(); }
        current.sequence=entry.sequence;current.bytes+=accepted.bytes;current.truncated=truncated;
        this.state.set(executionId,current);
        result={acceptedBytes:accepted.bytes,truncated};
      } catch(error) {
        if(error instanceof BridgeRpcError)throw error;
        throw new BridgeRpcError('HEADLESS_OUTPUT_FAILED','Unable to persist headless output');
      }
    });
    this.queue=task.catch(()=>{});
    await task;
    return result;
  }

  async page(executionId:string,after:number,limit:number):Promise<{entries:HeadlessOutputEntry[];nextCursor:number;truncated:boolean}>{
    await this.queue;const file=await this.file(executionId);
    try {
      const stat=await fs.lstat(file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1)throw new Error('Invalid headless log');
      const raw=await fs.readFile(file,'utf8');
      const entries:HeadlessOutputEntry[]=[];
      for(const line of raw.split('\n')){
        if(!line)continue;
        const entry=HeadlessOutputEntrySchema.parse(JSON.parse(line));
        if(entry.sequence>after && entries.length<limit)entries.push(entry);
      }
      const nextCursor=entries.length?entries[entries.length-1]!.sequence:after;
      return {entries,nextCursor,truncated:this.state.get(executionId)?.truncated??false};
    } catch(error) {
      if((error as NodeJS.ErrnoException).code==='ENOENT')return {entries:[],nextCursor:after,truncated:this.state.get(executionId)?.truncated??false};
      if(error instanceof BridgeRpcError)throw error;
      throw new BridgeRpcError('HEADLESS_OUTPUT_FAILED','Unable to read headless output');
    }
  }

  stats(executionId:string):{outputBytes:number;outputTruncated:boolean}{
    const value=this.state.get(executionId) ?? {bytes:0,truncated:false,sequence:0};
    return {outputBytes:value.bytes,outputTruncated:value.truncated};
  }

  async flush():Promise<void>{await this.queue;}
}
