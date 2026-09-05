import fs from 'node:fs/promises';
import path from 'node:path';
import {DiagnosticBatchSchema,type DiagnosticBatch,type DiagnosticEntry,type DiagnosticPage} from '@godot-mcp/protocol';
import {BridgeRpcError} from '../bridge/rpc-router.js';
import type {SessionStore} from '../session/session-store.js';
interface RunLog {last:number;dropped:number;sourceDropped:number;bytes:number;degraded:boolean;}
export class DiagnosticStore {
  private entries:DiagnosticEntry[]=[];
  private readonly runs=new Map<string,RunLog>();
  private queue:Promise<void>=Promise.resolve();
  constructor(private readonly sessions:SessionStore,private readonly sessionId:string){}
  register(runId:string):void {if(!this.runs.has(runId))this.runs.set(runId,{last:0,dropped:0,sourceDropped:0,bytes:0,degraded:false});}
  append(input:DiagnosticBatch):Promise<void> {
    const batch=DiagnosticBatchSchema.parse(input);const run=this.runs.get(batch.runId);
    if(!run)return Promise.resolve();
    const task=this.queue.then(async()=>{
      run.sourceDropped=Math.max(run.sourceDropped,batch.dropped);
      const accepted:DiagnosticEntry[]=[];
      for(const entry of batch.entries){if(entry.sequence<=run.last)continue;run.last=entry.sequence;accepted.push(entry);this.entries.push(entry);}
      while(this.entries.length>2000){const removed=this.entries.shift()!;this.runs.get(removed.runId)!.dropped++;}
      if(!accepted.length)return;
      const text=accepted.map(e=>JSON.stringify(e)+'\n').join('');const bytes=Buffer.byteLength(text);
      if(run.bytes+bytes>10*1024*1024){run.degraded=true;return;}
      try {
        const dir=await this.sessions.ensureDirectory(this.sessionId,'logs/runtime');
        const file=path.join(dir,batch.runId+'.jsonl');
        try {if((await fs.lstat(file)).isSymbolicLink())throw new Error('Log is a link');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
        const handle=await fs.open(file,'a');try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}
        run.bytes+=bytes;
      }catch{run.degraded=true;}
    });
    this.queue=task.catch(()=>{});return task;
  }
  degraded(runId:string):boolean{return this.runs.get(runId)?.degraded??false;}
  tail(runId:string,limit:number):DiagnosticPage {
    const run=this.runs.get(runId);if(!run)throw new BridgeRpcError('RUN_NOT_FOUND','Run is not in this session');
    const bounded=Math.max(1,Math.min(200,Math.trunc(limit)));
    const available=this.entries.filter(e=>e.runId===runId);
    const entries=available.slice(-bounded);
    return {runId,entries,nextCursor:run.last,oldestAvailable:available[0]?.sequence??run.last+1,
      dropped:run.dropped+run.sourceDropped,truncated:run.degraded||run.dropped>0||run.sourceDropped>0};
  }
  query(runId:string,kind:DiagnosticEntry['kind']|'all',after:number,limit:number):DiagnosticPage {
    const run=this.runs.get(runId);if(!run)throw new BridgeRpcError('RUN_NOT_FOUND','Run is not in this session');
    const available=this.entries.filter(e=>e.runId===runId);const result:DiagnosticEntry[]=[];let cursor=after;
    for(const entry of available){if(entry.sequence<=after)continue;cursor=entry.sequence;if(kind==='all'||entry.kind===kind)result.push(entry);if(result.length>=limit)break;}
    if(result.length<limit)cursor=Math.max(cursor,run.last);
    return {runId,entries:result,nextCursor:cursor,oldestAvailable:available[0]?.sequence??run.last+1,
      dropped:run.dropped+run.sourceDropped,truncated:run.degraded||run.dropped>0||run.sourceDropped>0};
  }
  async flush():Promise<void>{await this.queue;}
}
