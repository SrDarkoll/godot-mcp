import {expect,it} from 'vitest';
import {BridgeRuntimeEventSchema} from '../src/events.js';
it('binds diagnostics to their run and rejects unknown event envelopes',()=>{
  const runId='123e4567-e89b-42d3-a456-426614174000';
  const input={type:'event',protocol:1,sessionId:'s',sequence:1,event:'runtime.diagnostics',data:{runId,entries:[],dropped:0}};
  expect(BridgeRuntimeEventSchema.safeParse(input).success).toBe(true);
  expect(BridgeRuntimeEventSchema.safeParse({...input,event:'shell.exec'}).success).toBe(false);
  expect(BridgeRuntimeEventSchema.safeParse({...input,sequence:-1}).success).toBe(false);
});
