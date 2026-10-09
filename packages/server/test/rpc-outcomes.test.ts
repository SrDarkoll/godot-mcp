import {expect,it,vi} from 'vitest';
import WebSocket from 'ws';
import {RpcRouter} from '../src/bridge/rpc-router.js';

it('distinguishes a request that never had a connected editor',async()=>{
  const router=new RpcRouter(()=>null);
  await expect(router.call('tilemap.set_cells',{cells:[{}]})).rejects.toMatchObject({
    code:'EDITOR_NOT_CONNECTED',details:{requestId:'req-1',dispatchState:'not_sent',executionOutcome:'not_applied',appliedCount:0}
  });
});

it('reports an unknown outcome after disconnection without replaying',async()=>{
  const send=vi.fn();
  const socket={readyState:WebSocket.OPEN,send} as unknown as WebSocket;
  const router=new RpcRouter(()=>socket);
  const request=router.call('tilemap.set_cells',{cells:[{}]},1000);
  router.disconnect();
  await expect(request).rejects.toMatchObject({code:'EDITOR_NOT_CONNECTED',details:{requestId:'req-1',executionOutcome:'unknown',appliedCount:null}});
  expect(send).toHaveBeenCalledTimes(1);
});

it('reports a timeout as unconfirmed rather than safe to replay',async()=>{
  const send=vi.fn();
  const router=new RpcRouter(()=>({readyState:WebSocket.OPEN,send} as unknown as WebSocket));
  await expect(router.call('tilemap.set_cells',{cells:[{}]},5)).rejects.toMatchObject({code:'TIMEOUT',details:{requestId:'req-1',executionOutcome:'unknown'}});
  expect(send).toHaveBeenCalledTimes(1);
});

it('returns an acknowledged cell count and request ID',async()=>{
  const router=new RpcRouter(()=>({readyState:WebSocket.OPEN,send:vi.fn()} as unknown as WebSocket));
  const result=router.call('tilemap.set_cells',{cells:[{},{}]},1000);
  router.handleMessage(JSON.stringify({id:'req-1',protocol:1,ok:true,result:{node_path:'/Scene/Ground',changed_count:2}}));
  await expect(result).resolves.toMatchObject({requestId:'req-1',confirmation:'applied',requested_count:2,applied_count:2});
});

it('preserves a partial acknowledgement as partial',async()=>{
  const router=new RpcRouter(()=>({readyState:WebSocket.OPEN,send:vi.fn()} as unknown as WebSocket));
  const result=router.call('tilemap.set_cells',{cells:[{},{}]},1000);
  router.handleMessage(JSON.stringify({id:'req-1',protocol:1,ok:true,result:{changed_count:1}}));
  await expect(result).resolves.toMatchObject({confirmation:'partial',applied_count:1,requested_count:2});
});

it('reports zero applied changes when native validation rejected the request before dispatch',async()=>{
  const router=new RpcRouter(()=>({readyState:WebSocket.OPEN,send:vi.fn()} as unknown as WebSocket));
  const result=router.call('tilemap.set_cells',{cells:[{}]},1000);
  router.handleMessage(JSON.stringify({id:'req-1',protocol:1,ok:false,error:{code:'ARGUMENT_TOO_LARGE',message:'budget exceeded',details:{applied:false}}}));
  await expect(result).rejects.toMatchObject({code:'ARGUMENT_TOO_LARGE',details:{dispatchState:'response_received',executionOutcome:'not_applied',appliedCount:0}});
});

it('rejects an oversized encoded frame before sending it',async()=>{
  const send=vi.fn();
  const router=new RpcRouter(()=>({readyState:WebSocket.OPEN,send} as unknown as WebSocket));
  await expect(router.call('node.set_property',{value:'\n'.repeat(5*1024*1024)})).rejects.toMatchObject({
    code:'ARGUMENT_TOO_LARGE',details:{dispatchState:'not_sent',executionOutcome:'not_applied',appliedCount:0,maxBytes:8*1024*1024}
  });
  expect(send).not.toHaveBeenCalled();
});

it('retains the transport close reason while keeping an unconfirmed mutation unknown',async()=>{
  const router=new RpcRouter(()=>({readyState:WebSocket.OPEN,send:vi.fn()} as unknown as WebSocket));
  const result=router.call('tilemap.set_cells',{cells:[{}]},1000);
  router.disconnect({closeCode:1009,closeReason:'Message too big'});
  await expect(result).rejects.toMatchObject({code:'EDITOR_NOT_CONNECTED',details:{executionOutcome:'unknown',appliedCount:null,transportCloseCode:1009,transportCloseReason:'Message too big'}});
});
