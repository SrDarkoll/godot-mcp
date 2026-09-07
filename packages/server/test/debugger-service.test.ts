import {randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {NO_RUNTIME_FEATURES,type BridgeRuntimeEvent,type RuntimeStatus} from '@godot-mcp/protocol';
import {DebuggerService} from '../src/debugger/debugger-service.js';
import {DapRequestError,type DapCloseListener,type DapEvent,type DapEventListener,type DapTransport} from '../src/debugger/dap-transport.js';

class FakeRuntime {
  private listeners=new Set<(status:RuntimeStatus)=>void>();
  constructor(private status:RuntimeStatus){}
  peek(){return structuredClone(this.status);}
  subscribe(listener:(status:RuntimeStatus)=>void){this.listeners.add(listener);listener(this.peek());return()=>this.listeners.delete(listener);}
  set(status:RuntimeStatus){this.status=status;for(const listener of this.listeners)listener(this.peek());}
}
class FakeDap implements DapTransport {
  requests:{command:string;args:Record<string,unknown>}[]=[];
  events=new Set<DapEventListener>();closes=new Set<DapCloseListener>();closed=false;
  handler:((command:string,args:Record<string,unknown>)=>Promise<Record<string,unknown>>)|null=null;
  async connect(host:string,port:number,_timeoutMs:number){if(host!=='127.0.0.1'||port!==6006)throw new Error('bad endpoint');}
  async request(command:string,args:Record<string,unknown>,_timeoutMs:number){
    this.requests.push({command,args});
    if(this.handler)return this.handler(command,args);
    // Godot 4.6.3 emits `initialized` while processing `initialize`, before the
    // initialize response promise has resumed on the client. Keep the fake in
    // that ordering so a late waiter cannot regress unnoticed.
    if(command==='initialize')this.emit({seq:2,type:'event',event:'initialized'});
    return {};
  }
  onEvent(listener:DapEventListener){this.events.add(listener);return()=>this.events.delete(listener);}
  onClose(listener:DapCloseListener){this.closes.add(listener);return()=>this.closes.delete(listener);}
  emit(event:DapEvent){for(const listener of this.events)listener(event);}
  close(){if(this.closed)return;this.closed=true;for(const listener of this.closes)listener(new Error('closed'));}
}
const stopped=():RuntimeStatus=>({state:'stopped',runId:null,scenePath:null,connected:false,ownership:'none',features:NO_RUNTIME_FEATURES,errorCode:null});
const running=(runId=randomUUID()):RuntimeStatus=>({state:'running',runId,scenePath:'res://main.tscn',connected:true,ownership:'session',features:NO_RUNTIME_FEATURES,errorCode:null});
const info=(overrides:Record<string,unknown>={})=>({dapHost:'127.0.0.1',dapPort:6006,debugHost:'127.0.0.1',debugPort:6007,breakpointOwnerSessionId:'session-1',breakpoints:[],mcpBreakpoints:[],...overrides});

function setup(status:RuntimeStatus=stopped(),infoOverrides:Record<string,unknown>={}){
  const runtime=new FakeRuntime(status);const dap=new FakeDap();
  const call=vi.fn(async(method:string,params:Record<string,unknown>)=>{
    if(method==='debugger.info')return info(infoOverrides);
    if(method==='debugger.breakpoint.set')return {scriptPath:params.script_path,line:params.line,applied:true};
    if(method==='debugger.breakpoint.remove')return {scriptPath:params.script_path,line:params.line,removed:true};
    if(method==='debugger.step_out')return {accepted:true,runId:runtime.peek().runId,action:'step_out'};
    if(method==='debugger.dap_sync.begin')return {active:true};
    if(method==='debugger.dap_sync.end')return {active:false};
    throw new Error(method);
  });
  const bridge={connected:true,rpc:{call}};
  const session={id:'session-1',projectRoot:process.cwd()} as any;
  const service=new DebuggerService(session,runtime as any,bridge as any,()=>dap);
  return {service,runtime,dap,bridge,call};
}

describe('DebuggerService',()=>{
  it('rejects debugger context for external runtimes before debugger availability checks',async()=>{
    const {service}=setup({...running(),ownership:'external'});
    await expect(service.stack()).rejects.toMatchObject({code:'RUNTIME_NOT_OWNED'});
    await service.close();
  });

  it('attaches only to the correlated local Godot DAP endpoint using initialize/attach/configurationDone',async()=>{
    const run=running();const {service,dap}=setup(run);await service.editorConnected();
    expect(dap.requests.map(value=>value.command)).toEqual(['initialize','attach','configurationDone']);
    expect(dap.requests[0]?.args).toMatchObject({clientID:'godot-mcp',adapterID:'godot',linesStartAt1:true,columnsStartAt1:true});
    expect(dap.requests.some(value=>['launch','setBreakpoints','evaluate','setVariable'].includes(value.command))).toBe(false);
    await service.close();
  });

  it('brackets Godot DAP initialize and restores only pre-existing manual editor breakpoints',async()=>{
    const run=running();const {service,dap,call}=setup(run,{
      breakpoints:[{scriptPath:'res://debug_target.gd',line:4},{scriptPath:'res://debug_target.gd',line:8}],
      mcpBreakpoints:[{scriptPath:'res://debug_target.gd',line:8}]
    });
    await service.editorConnected();
    expect(dap.requests.map(value=>value.command)).toEqual(['initialize','setBreakpoints','attach','configurationDone']);
    const sync=dap.requests.find(value=>value.command==='setBreakpoints');
    expect(sync?.args).toMatchObject({breakpoints:[{line:4}]});
    expect(String((sync?.args.source as any)?.path).replaceAll('\\','/')).toBe(`${process.cwd().replaceAll('\\','/')}/debug_target.gd`);
    const methods=call.mock.calls.map(([method])=>method);
    expect(methods.indexOf('debugger.dap_sync.begin')).toBeGreaterThanOrEqual(0);
    expect(methods.indexOf('debugger.dap_sync.end')).toBeGreaterThan(methods.indexOf('debugger.dap_sync.begin'));
    await service.close();
  });

  it('uses Godot main-thread fallback when an owned session breakpoint breaks without a DAP stopped event',async()=>{
    const run=running();const {service,runtime,dap}=setup(run);await service.editorConnected();
    dap.handler=async command=>command==='stackTrace'?{stackFrames:[{id:41,name:'session_only',source:{path:`${process.cwd()}/debug_target.gd`},line:17,column:1}]}:{};
    runtime.set({...run,state:'breaked'});
    await expect(service.stack()).resolves.toMatchObject({frames:[{name:'session_only',scriptPath:'res://debug_target.gd',line:17}]});
    expect(dap.requests.findLast(value=>value.command==='stackTrace')?.args).toMatchObject({threadId:1});
    await service.close();
  });

  it('normalizes Godot 4.6.3 zero stack columns to the public 1-based contract',async()=>{
    const run=running();const {service,runtime,dap}=setup(run);await service.editorConnected();
    dap.handler=async command=>command==='stackTrace'?{stackFrames:[{id:42,name:'godot_zero_column',source:{path:`${process.cwd()}/debug_target.gd`},line:17,column:0}]}:{};
    runtime.set({...run,state:'breaked'});
    await expect(service.stack()).resolves.toMatchObject({frames:[{name:'godot_zero_column',scriptPath:'res://debug_target.gd',line:17,column:1}]});
    await service.close();
  });

  it('establishes a break context only after both runtime breaked state and DAP stopped event',async()=>{
    const run=running();const {service,runtime,dap}=setup(run);await service.editorConnected();
    dap.handler=async(command,args)=>{
      if(command==='stackTrace')return {stackFrames:[{id:12,name:'target',source:{path:`${process.cwd()}/debug_target.gd`},line:7,column:2}]};
      if(command==='scopes')return {scopes:[{name:'Locals',variablesReference:40}]};
      if(command==='variables')return {variables:[{name:'health',type:'int',value:'75',variablesReference:0},{name:'items',type:'Array',value:'Array[1]',variablesReference:99}]};
      return {};
    };
    dap.emit({seq:4,type:'event',event:'stopped',body:{threadId:3}});
    await expect(service.stack()).rejects.toMatchObject({code:'RUNTIME_NOT_BREAKED'});
    runtime.set({...run,state:'breaked'});
    const stack=await service.stack();expect(stack.frames[0]).toMatchObject({name:'target',scriptPath:'res://debug_target.gd',line:7,column:2});
    const vars=await service.variables({frame_id:stack.frames[0]!.frameId});
    expect(vars.scopes[0]?.variables[0]).toMatchObject({name:'health',variableRef:null,valueTruncated:false});
    const ref=vars.scopes[0]?.variables[1]?.variableRef;expect(ref).toMatch(/^[0-9a-f-]{36}$/);
    const page=await service.expand({variable_ref:ref!,start:0,limit:100});expect(page.entries).toHaveLength(2);
    dap.emit({seq:5,type:'event',event:'continued',body:{threadId:3}});
    runtime.set({...run,state:'running'});
    await expect(service.variables({frame_id:stack.frames[0]!.frameId})).rejects.toMatchObject({code:'RUNTIME_NOT_BREAKED'});
    await service.close();
  });

  it('retries Godot variables while an async frame dump is still becoming available',async()=>{
    const run=running();const {service,runtime,dap}=setup(run);await service.editorConnected();
    let variableAttempts=0;
    dap.handler=async command=>{
      if(command==='stackTrace')return {stackFrames:[{id:51,name:'vars_pending',source:{path:`${process.cwd()}/debug_target.gd`},line:17,column:1}]};
      if(command==='scopes')return {scopes:[{name:'Locals',variablesReference:40}]};
      if(command==='variables'){
        variableAttempts++;
        if(variableAttempts===1)throw new DapRequestError('variables','unknown');
        return {variables:[{name:'local_value',type:'int',value:'42',variablesReference:0}]};
      }
      return {};
    };
    runtime.set({...run,state:'breaked'});
    const stack=await service.stack();
    const vars=await service.variables({frame_id:stack.frames[0]!.frameId});
    expect(variableAttempts).toBe(2);
    expect(vars.scopes[0]?.variables[0]).toMatchObject({name:'local_value',value:'42'});
    await service.close();
  });

  it('serializes execution control and does not silently queue overlapping operations',async()=>{
    const run=running();const {service,runtime,dap}=setup(run);await service.editorConnected();runtime.set({...run,state:'breaked'});dap.emit({seq:3,type:'event',event:'stopped',body:{threadId:8}});
    let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
    dap.handler=async command=>{if(command==='next')await pending;return {};};
    const first=service.stepOver();await new Promise(resolve=>setTimeout(resolve,0));
    await expect(service.continueExecution()).rejects.toMatchObject({code:'DEBUG_CONTROL_BUSY'});
    release();await expect(first).resolves.toMatchObject({accepted:true,runId:run.runId,action:'step_over'});
    await service.close();
  });

  it('routes step_out through the owned editor debugger bridge instead of unsupported Godot 4.6.3 DAP stepOut',async()=>{
    const run=running();const {service,runtime,dap,call}=setup(run);await service.editorConnected();
    runtime.set({...run,state:'breaked'});dap.emit({seq:9,type:'event',event:'stopped',body:{threadId:8}});
    await expect(service.stepOut()).resolves.toMatchObject({accepted:true,runId:run.runId,action:'step_out'});
    expect(call).toHaveBeenCalledWith('debugger.step_out',{run_id:run.runId});
    expect(dap.requests.some(value=>value.command==='stepOut')).toBe(false);
    await service.close();
  });

  it('never adopts or removes a manual breakpoint and cleans only session-owned entries',async()=>{
    const {service,call}=setup(stopped(),{breakpoints:[{scriptPath:'res://manual.gd',line:4}],mcpBreakpoints:[]});await service.editorConnected();
    await expect(service.setBreakpoint({script_path:'res://manual.gd',line:4})).rejects.toMatchObject({code:'BREAKPOINT_OWNERSHIP_CONFLICT'});
    await expect(service.removeBreakpoint({script_path:'res://manual.gd',line:4})).rejects.toMatchObject({code:'BREAKPOINT_NOT_OWNED'});
    await service.setBreakpoint({script_path:'res://owned.gd',line:5});
    await service.close();
    const removals=call.mock.calls.filter(([method])=>method==='debugger.breakpoint.remove');
    expect(removals).toHaveLength(1);expect(removals[0]?.[1]).toEqual({script_path:'res://owned.gd',line:5});
  });

  it('drops desired ownership when the editor snapshot proves the MCP breakpoint was manually removed',async()=>{
    const {service,call}=setup();await service.editorConnected();await service.setBreakpoint({script_path:'res://owned.gd',line:5});
    service.acceptBridgeEvent({type:'event',protocol:1,sessionId:'session-1',sequence:10,event:'debugger.breakpoints',data:{breakpoints:[]}} as BridgeRuntimeEvent);
    expect((await service.listBreakpoints()).breakpoints).toEqual([]);
    await service.close();expect(call.mock.calls.filter(([method])=>method==='debugger.breakpoint.remove')).toHaveLength(0);
  });

  it('fails closed when DAP attach fails without changing runtime ownership',async()=>{
    const run=running();const runtime=new FakeRuntime(stopped());const dap=new FakeDap();
    dap.connect=async()=>{throw new Error('connection refused by fixture');};
    const call=vi.fn(async(method:string)=>{if(method==='debugger.info')return info();throw new Error(method);});
    const bridge={connected:true,rpc:{call}};
    const service=new DebuggerService({id:'session-1',projectRoot:process.cwd()} as any,runtime as any,bridge as any,()=>dap);
    await service.editorConnected();runtime.set(run);
    await new Promise(resolve=>setTimeout(resolve,0));
    await expect(service.stack()).rejects.toMatchObject({code:'DEBUGGER_UNAVAILABLE'});
    expect(runtime.peek()).toEqual(run);
    await service.close();
  });

  it('invalidates old references and closes the old transport when runId changes',async()=>{
    const first=running();const runtime=new FakeRuntime(stopped());const daps=[new FakeDap(),new FakeDap()];let index=0;
    const call=vi.fn(async(method:string)=>{if(method==='debugger.info')return info();throw new Error(method);});
    const service=new DebuggerService({id:'session-1',projectRoot:process.cwd()} as any,runtime as any,{connected:true,rpc:{call}} as any,()=>daps[index++]!);
    await service.editorConnected();runtime.set(first);await new Promise(resolve=>setTimeout(resolve,0));
    const dap=daps[0]!;dap.handler=async command=>command==='stackTrace'?{stackFrames:[{id:1,name:'first',source:{path:`${process.cwd()}/first.gd`},line:2,column:1}]}:{};
    runtime.set({...first,state:'breaked'});dap.emit({seq:3,type:'event',event:'stopped',body:{threadId:1}});
    const stack=await service.stack();
    const second=running();runtime.set(second);await new Promise(resolve=>setTimeout(resolve,0));
    expect(dap.closed).toBe(true);
    runtime.set({...second,state:'breaked'});daps[1]!.emit({seq:4,type:'event',event:'stopped',body:{threadId:2}});
    await expect(service.variables({frame_id:stack.frames[0]!.frameId})).rejects.toMatchObject({code:'STALE_DEBUG_REFERENCE'});
    await service.close();
  });

  it('supports runtime-breaked-before-DAP-stopped ordering',async()=>{
    const run=running();const {service,runtime,dap}=setup(run);await service.editorConnected();
    runtime.set({...run,state:'breaked'});
    await expect(service.stack()).rejects.toMatchObject({code:'DEBUGGER_UNAVAILABLE'});
    dap.handler=async command=>command==='stackTrace'?{stackFrames:[{id:7,name:'late',source:{path:`${process.cwd()}/late.gd`},line:3,column:1}]}:{};
    dap.emit({seq:5,type:'event',event:'stopped',body:{threadId:9}});
    await expect(service.stack()).resolves.toMatchObject({frames:[{name:'late',scriptPath:'res://late.gd'}]});
    await service.close();
  });

  it('rejects DAP stack sources outside the project and truncates long variable representations',async()=>{
    const run=running();const {service,runtime,dap}=setup(run);await service.editorConnected();runtime.set({...run,state:'breaked'});dap.emit({seq:6,type:'event',event:'stopped',body:{threadId:2}});
    dap.handler=async command=>command==='stackTrace'?{stackFrames:[{id:1,name:'bad',source:{path:'/outside/project.gd'},line:1,column:1}]}:{};
    await expect(service.stack()).rejects.toMatchObject({code:'DEBUG_PROTOCOL_ERROR'});
    dap.handler=async command=>{
      if(command==='stackTrace')return {stackFrames:[{id:2,name:'ok',source:{path:`${process.cwd()}/vars.gd`},line:1,column:1}]};
      if(command==='scopes')return {scopes:[{name:'Locals',variablesReference:2}]};
      if(command==='variables')return {variables:[{name:'huge',type:'String',value:'x'.repeat(5000),variablesReference:0}]};
      return {};
    };
    const stack=await service.stack();const vars=await service.variables({frame_id:stack.frames[0]!.frameId});
    expect(vars.scopes[0]?.variables[0]).toMatchObject({valueTruncated:true});
    expect(vars.scopes[0]?.variables[0]?.value).toHaveLength(4096);
    await service.close();
  });

  it('keeps break context valid when a DAP control request fails',async()=>{
    const run=running();const {service,runtime,dap}=setup(run);await service.editorConnected();runtime.set({...run,state:'breaked'});dap.emit({seq:7,type:'event',event:'stopped',body:{threadId:4}});
    dap.handler=async command=>{if(command==='next')throw new Error('adapter rejected next');if(command==='stackTrace')return {stackFrames:[{id:3,name:'still',source:{path:`${process.cwd()}/still.gd`},line:5,column:1}]};return {};};
    await expect(service.stepOver()).rejects.toThrow('adapter rejected next');
    await expect(service.stack()).resolves.toMatchObject({frames:[{name:'still'}]});
    await service.close();
  });

  it('isolates unexpected DAP transport failure from runtime lifecycle',async()=>{
    const run=running();const {service,runtime,dap}=setup(run);await service.editorConnected();
    for(const listener of dap.closes)listener(new Error('transport lost'));
    await expect(service.stack()).rejects.toMatchObject({code:'DEBUGGER_UNAVAILABLE'});
    expect(runtime.peek()).toEqual(run);
    await service.close();
  });

  it('requires an editor connection for all breakpoint operations',async()=>{
    const {service,bridge}=setup();bridge.connected=false;service.editorDisconnected();
    await expect(service.setBreakpoint({script_path:'res://x.gd',line:1})).rejects.toMatchObject({code:'EDITOR_NOT_CONNECTED'});
    await expect(service.removeBreakpoint({script_path:'res://x.gd',line:1})).rejects.toMatchObject({code:'EDITOR_NOT_CONNECTED'});
    await expect(service.listBreakpoints()).rejects.toMatchObject({code:'EDITOR_NOT_CONNECTED'});
    await service.close();
  });

  it('reconciles same-session mirrors, drops ambiguous inventory, and never adopts stale new-session breakpoints',async()=>{
    const base=setup();await base.service.editorConnected();await base.service.setBreakpoint({script_path:'res://owned.gd',line:5});
    base.bridge.connected=false;base.service.editorDisconnected();
    base.bridge.connected=true;
    base.call.mockImplementation(async(method:string,params:Record<string,unknown>)=>{
      if(method==='debugger.info')return info({breakpoints:[{scriptPath:'res://owned.gd',line:5}],mcpBreakpoints:[{scriptPath:'res://owned.gd',line:5}]});
      if(method==='debugger.breakpoint.remove')return {scriptPath:params.script_path,line:params.line,removed:true};
      throw new Error(method);
    });
    await base.service.editorConnected();expect((await base.service.listBreakpoints()).breakpoints).toHaveLength(1);
    base.bridge.connected=false;base.service.editorDisconnected();base.bridge.connected=true;
    base.call.mockImplementation(async(method:string)=>method==='debugger.info'?info({breakpoints:[{scriptPath:'res://owned.gd',line:5}],mcpBreakpoints:[]}):Promise.reject(new Error(method)));
    await base.service.editorConnected();expect((await base.service.listBreakpoints()).breakpoints).toEqual([]);
    await base.service.close();

    const stale=setup(stopped(),{breakpointOwnerSessionId:'old-session',breakpoints:[{scriptPath:'res://stale.gd',line:8}],mcpBreakpoints:[]});
    await stale.service.editorConnected();
    await expect(stale.service.setBreakpoint({script_path:'res://stale.gd',line:8})).rejects.toMatchObject({code:'BREAKPOINT_OWNERSHIP_CONFLICT'});
    await stale.service.close();
  });

  it('continues cleanup after a breakpoint removal failure and reports the failure afterward',async()=>{
    const {service,call}=setup();await service.editorConnected();
    await service.setBreakpoint({script_path:'res://a.gd',line:1});await service.setBreakpoint({script_path:'res://b.gd',line:2});
    let removals=0;call.mockImplementation(async(method:string,params:Record<string,unknown>)=>{
      if(method==='debugger.info')return info();
      if(method==='debugger.breakpoint.remove'){removals++;if(removals===1)throw new Error('first cleanup failed');return {scriptPath:params.script_path,line:params.line,removed:true};}
      if(method==='debugger.breakpoint.set')return {scriptPath:params.script_path,line:params.line,applied:true};
      throw new Error(method);
    });
    await expect(service.close()).rejects.toThrow('first cleanup failed');
    expect(removals).toBe(2);
  });


  it('does not mutate breakpoint ownership when private bridge data is malformed',async()=>{
    const {service,call}=setup();await service.editorConnected();
    call.mockImplementation(async(method:string,params:Record<string,unknown>)=>{
      if(method==='debugger.info')return info();
      if(method==='debugger.breakpoint.set')return {scriptPath:params.script_path,line:'not-a-line',applied:true};
      throw new Error(method);
    });
    await expect(service.setBreakpoint({script_path:'res://bad-response.gd',line:3})).rejects.toMatchObject({code:'DEBUG_PROTOCOL_ERROR'});
    expect((await service.listBreakpoints()).breakpoints).toEqual([]);
    await service.close();
  });

  it('retains desired ownership when reconnect reapply fails',async()=>{
    const {service,bridge,call}=setup();await service.editorConnected();await service.setBreakpoint({script_path:'res://keep.gd',line:6});
    bridge.connected=false;service.editorDisconnected();bridge.connected=true;
    call.mockImplementation(async(method:string)=>{
      if(method==='debugger.info')return info({breakpoints:[],mcpBreakpoints:[]});
      if(method==='debugger.breakpoint.set')throw new Error('temporary editor failure');
      throw new Error(method);
    });
    await expect(service.editorConnected()).rejects.toThrow('temporary editor failure');
    expect((await service.listBreakpoints()).breakpoints).toEqual([{scriptPath:'res://keep.gd',line:6}]);
    bridge.connected=false;service.editorDisconnected();await service.close();
  });

});
