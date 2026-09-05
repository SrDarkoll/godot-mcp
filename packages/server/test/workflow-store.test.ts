import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {expect,it} from 'vitest';
import {NO_RUNTIME_FEATURES} from '@godot-mcp/protocol';
import {createSession} from '../src/session/session.js';
import {SessionStore} from '../src/session/session-store.js';
import {WorkflowStore} from '../src/workflow/workflow-store.js';

it('persists immutable UUID workflow snapshots inside the current session',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-workflow-store-'));
  const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);
  const store=new WorkflowStore(session,sessions);
  const saved=await store.save({label:'before',activeScene:null,
    runtime:{state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:NO_RUNTIME_FEATURES,errorCode:null},
    diagnostics:null,screenshot:null,cursors:{nextScreenshotSequence:1,errors:0,transactions:0,checkpoints:0,runtimeRuns:0}});
  expect(saved.id).toMatch(/^[a-f0-9-]{36}$/);
  expect(await store.load(saved.id)).toEqual(saved);
  const file=path.join(root,'.godot-mcp','sessions',session.id,'artifacts','workflow',`${saved.id}.json`);
  expect(JSON.parse(await fs.readFile(file,'utf8')).id).toBe(saved.id);
  await expect(store.load('../outside')).rejects.toMatchObject({code:'WORKFLOW_SNAPSHOT_NOT_FOUND'});
});


it('does not create workflow artifact directories while reading a missing snapshot',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'godot-mcp-workflow-readonly-'));
  const session=createSession(root);const sessions=new SessionStore(root);await sessions.create(session);
  const store=new WorkflowStore(session,sessions);const workflowDir=path.join(root,'.godot-mcp','sessions',session.id,'artifacts','workflow');
  await expect(store.load('123e4567-e89b-42d3-a456-426614174099')).rejects.toMatchObject({code:'WORKFLOW_SNAPSHOT_NOT_FOUND'});
  await expect(fs.lstat(workflowDir)).rejects.toMatchObject({code:'ENOENT'});
});
