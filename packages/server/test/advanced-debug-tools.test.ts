import {expect,it,vi} from 'vitest';
import {
  continueDebugger,expandDebugVariable,getDebugStack,getDebugVariables,listDebugBreakpoints,
  removeDebugBreakpoint,setDebugBreakpoint,stepIntoDebugger,stepOutDebugger,stepOverDebugger
} from '../src/tools/advanced-debug-tools.js';

it('delegates every advanced debugger handler to DebuggerService with exact arguments',async()=>{
  const fake={
    setBreakpoint:vi.fn(async()=>({set:true})),
    removeBreakpoint:vi.fn(async()=>({removed:true})),
    listBreakpoints:vi.fn(async()=>({list:true})),
    stack:vi.fn(async()=>({stack:true})),
    variables:vi.fn(async()=>({variables:true})),
    expand:vi.fn(async()=>({expand:true})),
    continueExecution:vi.fn(async()=>({continue:true})),
    stepInto:vi.fn(async()=>({into:true})),
    stepOver:vi.fn(async()=>({over:true})),
    stepOut:vi.fn(async()=>({out:true}))
  } as any;
  const breakpoint={script_path:'res://debug_target.gd',line:12};
  const frame={frame_id:'11111111-1111-4111-8111-111111111111'};
  const variable={variable_ref:'22222222-2222-4222-8222-222222222222',start:3,limit:50};

  await expect(setDebugBreakpoint(fake,breakpoint)).resolves.toEqual({set:true});
  await expect(removeDebugBreakpoint(fake,breakpoint)).resolves.toEqual({removed:true});
  await expect(listDebugBreakpoints(fake,{})).resolves.toEqual({list:true});
  await expect(getDebugStack(fake,{})).resolves.toEqual({stack:true});
  await expect(getDebugVariables(fake,frame)).resolves.toEqual({variables:true});
  await expect(expandDebugVariable(fake,variable)).resolves.toEqual({expand:true});
  await expect(continueDebugger(fake,{})).resolves.toEqual({continue:true});
  await expect(stepIntoDebugger(fake,{})).resolves.toEqual({into:true});
  await expect(stepOverDebugger(fake,{})).resolves.toEqual({over:true});
  await expect(stepOutDebugger(fake,{})).resolves.toEqual({out:true});

  expect(fake.setBreakpoint).toHaveBeenCalledWith(breakpoint);
  expect(fake.removeBreakpoint).toHaveBeenCalledWith(breakpoint);
  expect(fake.listBreakpoints).toHaveBeenCalledTimes(1);
  expect(fake.stack).toHaveBeenCalledTimes(1);
  expect(fake.variables).toHaveBeenCalledWith(frame);
  expect(fake.expand).toHaveBeenCalledWith(variable);
  expect(fake.continueExecution).toHaveBeenCalledTimes(1);
  expect(fake.stepInto).toHaveBeenCalledTimes(1);
  expect(fake.stepOver).toHaveBeenCalledTimes(1);
  expect(fake.stepOut).toHaveBeenCalledTimes(1);
});
