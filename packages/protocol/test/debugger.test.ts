import { describe, expect, it } from 'vitest';
import {
  DebugBreakpointSetSchema,
  DebugExpandSchema,
  DebugStackResultSchema,
  DebugVariablesResultSchema,
  MAX_DEBUG_VARIABLE_PAGE,
  MAX_DEBUG_VALUE_CHARS
} from '../src/debugger.js';

describe('advanced debugger protocol', () => {
  it('accepts only confined 1-based GDScript breakpoint inputs', () => {
    expect(DebugBreakpointSetSchema.parse({script_path:'res://actors/player.gd',line:1}))
      .toEqual({script_path:'res://actors/player.gd',line:1});
    for (const script_path of ['../player.gd','C:/player.gd','user://player.gd','res://../player.gd','res:\\player.gd','res://player.txt']) {
      expect(DebugBreakpointSetSchema.safeParse({script_path,line:1}).success, script_path).toBe(false);
    }
    expect(DebugBreakpointSetSchema.safeParse({script_path:'res://player.gd',line:0}).success).toBe(false);
    expect(DebugBreakpointSetSchema.safeParse({script_path:'res://player.gd',line:1,extra:true}).success).toBe(false);
  });

  it('bounds lazy variable expansion', () => {
    expect(DebugExpandSchema.parse({variable_ref:'11111111-1111-4111-8111-111111111111'}))
      .toEqual({variable_ref:'11111111-1111-4111-8111-111111111111',start:0,limit:100});
    expect(MAX_DEBUG_VARIABLE_PAGE).toBe(500);
    expect(MAX_DEBUG_VALUE_CHARS).toBe(4096);
    expect(DebugExpandSchema.safeParse({variable_ref:'11111111-1111-4111-8111-111111111111',start:0,limit:501}).success).toBe(false);
  });

  it('models opaque frame and variable references without backend ids', () => {
    expect(DebugStackResultSchema.safeParse({
      breakId:'11111111-1111-4111-8111-111111111111',
      frames:[{frameId:'22222222-2222-4222-8222-222222222222',name:'target',scriptPath:'res://debug_target.gd',line:12,column:3}]
    }).success).toBe(true);
    expect(DebugVariablesResultSchema.safeParse({
      frameId:'22222222-2222-4222-8222-222222222222',
      scopes:[{name:'Locals',variables:[{name:'health',type:'int',value:'75',variableRef:null,valueTruncated:false}]}]
    }).success).toBe(true);
  });
});
