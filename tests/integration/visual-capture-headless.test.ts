import {spawn} from 'node:child_process';
import {cp,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,it} from 'vitest';
import {BridgeServer} from '../../packages/server/src/bridge/bridge-server.js';
import {createSession} from '../../packages/server/src/session/session.js';
import {BridgeDescriptorStore} from '../../packages/server/src/session/bridge-descriptor.js';
import {initProject} from '../../packages/cli/src/init/init-project.js';

it('rejects headless captures without blocking subsequent RPCs',async () => {
  const godot = process.env.GODOT_BIN;
  if (!godot) throw new Error('GODOT_BIN required');
  const parent = path.resolve('.godot-mcp/visual-test-runs');
  await mkdir(parent,{recursive:true});
  const root = await mkdtemp(path.join(parent,'headless-'));
  await cp(path.resolve('fixtures/empty-project'),root,{recursive:true});
  await initProject({projectRoot:root,godotBin:godot,enable:true});
  const session = createSession(root); const token = 'a'.repeat(64);
  const bridge = new BridgeServer({session,token,port:0});
  const {port} = await bridge.start();
  const descriptor = new BridgeDescriptorStore(root);
  await descriptor.write({port,token,sessionId:session.id});
  const child = spawn(godot,['--headless','--editor','--path',root,'res://main.tscn'],{windowsHide:true});
  let logs = ''; child.stdout.on('data',d => logs+=d); child.stderr.on('data',d => logs+=d);
  try {
    await bridge.waitUntilConnected(15000);
    expect(bridge.capabilities).toMatchObject({viewport2d:false,viewport3d:false});
    const results = await Promise.allSettled([
      bridge.rpc.call('visual.capture_viewport_2d',{}),
      bridge.rpc.call('visual.capture_viewport_3d',{viewport_index:0}),
      bridge.rpc.call('project.info',{})
    ]);
    for (const r of results.slice(0,2)) {
      expect(r.status).toBe('rejected');
      if (r.status === 'rejected') expect(r.reason.code).toBe('CAPTURE_UNSUPPORTED');
    }
    expect(results[2]?.status).toBe('fulfilled');
    await expect(bridge.rpc.call('visual.capture_viewport_3d',{viewport_index:4})).rejects.toMatchObject({code:'INVALID_REQUEST'});
    expect(logs).not.toMatch(/SCRIPT ERROR|Parse Error/);
  } finally {
    child.kill(); await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit',()=>resolve()); });
    await bridge.stop(); await descriptor.remove();
    await writeFile(path.join(root,'test-output.log'),logs);
  }
},30000);
