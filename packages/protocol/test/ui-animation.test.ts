import {describe,expect,it} from 'vitest';
import {
  AnimationLoopModeSchema,
  AnimationEditableTrackTypeSchema,
  AnimationTrackTypeSchema,
  UiLayoutPresetSchema,
  UiSizeFlagSchema
} from '../src/index.js';

describe('UI and animation power-tool protocol',()=>{
  it('accepts documented UI enums and rejects unknown values',()=>{
    expect(UiLayoutPresetSchema.parse('full_rect')).toBe('full_rect');
    expect(UiLayoutPresetSchema.parse('center')).toBe('center');
    expect(UiSizeFlagSchema.parse('expand')).toBe('expand');
    expect(UiSizeFlagSchema.parse('shrink_center')).toBe('shrink_center');
    expect(()=>UiLayoutPresetSchema.parse('fill_parent')).toThrow();
    expect(()=>UiSizeFlagSchema.parse('stretch')).toThrow();
  });

  it('accepts documented animation enums and rejects unsupported audio tracks',()=>{
    expect(AnimationLoopModeSchema.parse('pingpong')).toBe('pingpong');
    expect(AnimationTrackTypeSchema.parse('rotation_3d')).toBe('rotation_3d');
    expect(AnimationTrackTypeSchema.parse('animation')).toBe('animation');
    expect(()=>AnimationLoopModeSchema.parse('repeat')).toThrow();
    expect(AnimationTrackTypeSchema.parse('audio')).toBe('audio');
    expect(()=>AnimationEditableTrackTypeSchema.parse('audio')).toThrow();
  });
});
