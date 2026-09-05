import {expect,it} from 'vitest';
import {DiagnosticBatchSchema} from '../src/diagnostics.js';
it('bounds native logger messages before accepting them',()=>{
  const runId='123e4567-e89b-42d3-a456-426614174000';
  const entry={runId,sequence:1,timestamp:'2026-09-05T00:00:00Z',kind:'output',stream:'stdout',message:'hello',file:null,line:null,frames:[],truncated:false};
  expect(DiagnosticBatchSchema.safeParse({runId,entries:[entry],dropped:0}).success).toBe(true);
  expect(DiagnosticBatchSchema.safeParse({runId,entries:[{...entry,message:'x'.repeat(4097)}],dropped:0}).success).toBe(false);
  expect(DiagnosticBatchSchema.safeParse({runId,entries:[{...entry,runId:'123e4567-e89b-42d3-a456-426614174001'}],dropped:0}).success).toBe(false);
});
