import {describe,expect,it} from 'vitest';
import {DebugReferenceStore} from '../src/debugger/debug-reference-store.js';

describe('DebugReferenceStore',()=>{
  it('makes references stale as soon as a break is invalidated',()=>{
    const refs=new DebugReferenceStore();
    refs.resetRuntime();
    const breakA=refs.beginBreak();
    const frameA=refs.createFrameRef(12);
    expect(refs.resolveFrameRef(frameA)).toBe(12);
    refs.invalidateBreak();
    expect(()=>refs.resolveFrameRef(frameA)).toThrowError(expect.objectContaining({code:'STALE_DEBUG_REFERENCE'}));
    const breakB=refs.beginBreak();
    expect(breakB).not.toBe(breakA);
  });

  it('makes frame and variable references stale across a runtime generation reset',()=>{
    const refs=new DebugReferenceStore();refs.resetRuntime();refs.beginBreak();
    const frame=refs.createFrameRef(9);const variable=refs.createVariableRef(27);
    refs.resetRuntime();
    expect(()=>refs.resolveFrameRef(frame)).toThrowError(expect.objectContaining({code:'STALE_DEBUG_REFERENCE'}));
    expect(()=>refs.resolveVariableRef(variable)).toThrowError(expect.objectContaining({code:'STALE_DEBUG_REFERENCE'}));
  });

  it('distinguishes unknown current-generation frame and variable UUIDs from stale references',()=>{
    const refs=new DebugReferenceStore();refs.resetRuntime();refs.beginBreak();
    const frame=refs.createFrameRef(1);const variable=refs.createVariableRef(2);
    const mutateCurrentGenerationRef=(ref:string)=>{const index=9;const replacement=ref[index]==='0'?'1':'0';return `${ref.slice(0,index)}${replacement}${ref.slice(index+1)}`;};
    const otherFrame=mutateCurrentGenerationRef(frame);
    const otherVariable=mutateCurrentGenerationRef(variable);
    expect(()=>refs.resolveFrameRef(otherFrame)).toThrowError(expect.objectContaining({code:'DEBUG_FRAME_NOT_FOUND'}));
    expect(()=>refs.resolveVariableRef(otherVariable)).toThrowError(expect.objectContaining({code:'DEBUG_VARIABLE_NOT_FOUND'}));
  });
});
