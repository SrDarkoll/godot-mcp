import {expect,it} from 'vitest';
import {RuntimeNodeParamsSchema,RunTargetSchema,DiagnosticQuerySchema,RuntimeStatusSchema} from '../src/runtime.js';
it('rejects runtime escape paths and ambiguous launch targets',()=>{
  for(const node_path of ['/Main','/root/../X','/root/A\\B','/root/GodotMcpRuntime','/root/A\0'])expect(RuntimeNodeParamsSchema.safeParse({node_path}).success).toBe(false);
  expect(RuntimeNodeParamsSchema.parse({node_path:'/root/Main/Player'}).node_path).toBe('/root/Main/Player');
  for(const input of [{target:'path'},{target:'main',path:'res://a.tscn'},{target:'path',path:'res://../a.tscn'}])expect(RunTargetSchema.safeParse(input).success).toBe(false);
  expect(DiagnosticQuerySchema.parse({})).toEqual({after:0,limit:100});
  expect(DiagnosticQuerySchema.safeParse({limit:201}).success).toBe(false);
  expect(RuntimeStatusSchema.safeParse({state:'running'}).success).toBe(false);
});
