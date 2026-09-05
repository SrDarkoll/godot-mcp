import {randomUUID} from 'node:crypto';
import fs,{type FileHandle} from 'node:fs/promises';
import path from 'node:path';
import {WorkflowSnapshotSchema,type WorkflowSnapshot} from '@godot-mcp/protocol';
import {BridgeRpcError} from '../bridge/rpc-router.js';
import type {SessionStore} from '../session/session-store.js';
import type {Session} from '../session/session.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export type WorkflowSnapshotDraft=Omit<WorkflowSnapshot,'id'|'sessionId'|'createdAt'>;

export class WorkflowStore {
  constructor(private readonly session:Session,private readonly sessions:SessionStore){}
  private async directory():Promise<string>{return this.sessions.ensureDirectory(this.session.id,'artifacts/workflow');}
  private async existingDirectory():Promise<string>{
    const base=this.sessions.sessionDir(this.session.id);
    const artifacts=path.join(base,'artifacts');const workflow=path.join(artifacts,'workflow');
    for(const dir of [artifacts,workflow]){
      const stat=await fs.lstat(dir);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw this.invalid();
    }
    return workflow;
  }
  private invalid():BridgeRpcError{return new BridgeRpcError('WORKFLOW_SNAPSHOT_NOT_FOUND','Workflow snapshot does not exist');}
  async save(draft:WorkflowSnapshotDraft):Promise<WorkflowSnapshot>{
    const snapshot=WorkflowSnapshotSchema.parse({...draft,id:randomUUID(),sessionId:this.session.id,createdAt:new Date().toISOString()});
    const file=path.join(await this.directory(),`${snapshot.id}.json`);
    let handle:FileHandle|undefined;
    try{
      handle=await fs.open(file,'wx');
      await handle.writeFile(`${JSON.stringify(snapshot,null,2)}\n`);
      await handle.sync();
    }catch(error){
      if((error as NodeJS.ErrnoException).code==='EEXIST')throw new BridgeRpcError('WORKFLOW_SNAPSHOT_CONFLICT','Workflow snapshot id already exists');
      throw error;
    }finally{await handle?.close();}
    return snapshot;
  }
  async load(id:string):Promise<WorkflowSnapshot>{
    if(!UUID.test(id))throw this.invalid();
    let directory:string;
    try{directory=await this.existingDirectory();}catch(error){
      if(error instanceof BridgeRpcError)throw error;
      if((error as NodeJS.ErrnoException).code==='ENOENT')throw this.invalid();
      throw new BridgeRpcError('WORKFLOW_SNAPSHOT_INVALID','Workflow snapshot directory is invalid');
    }
    const file=path.join(directory,`${id}.json`);
    try{
      const stat=await fs.lstat(file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw this.invalid();
      const snapshot=WorkflowSnapshotSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));
      if(snapshot.id!==id||snapshot.sessionId!==this.session.id)throw this.invalid();
      return snapshot;
    }catch(error){
      if(error instanceof BridgeRpcError)throw error;
      if((error as NodeJS.ErrnoException).code==='ENOENT')throw this.invalid();
      throw new BridgeRpcError('WORKFLOW_SNAPSHOT_INVALID','Workflow snapshot is unreadable or invalid');
    }
  }
}
