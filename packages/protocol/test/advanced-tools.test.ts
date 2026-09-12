import {expect,it} from 'vitest';
import {BatchApplySchema,DependencyImpactSchema,VisualCompareSchema,PerformanceCompareSchema,BridgeProjectEventSchema} from '../src/index.js';
it('enforces cross-field and bounded defaults for advanced tools',()=>{
 expect(BatchApplySchema.safeParse({operations:[]}).success).toBe(false);
 expect(BatchApplySchema.safeParse({operations:[{op:'delete',node:'..'}],expected:'a'.repeat(64)}).success).toBe(true); // Native scene scope validates logical node paths.
 expect(DependencyImpactSchema.safeParse({path:'res://a.tres',action:'move'}).success).toBe(false);
 expect(DependencyImpactSchema.safeParse({path:'res://a.tres',action:'delete',target_path:'res://b.tres'}).success).toBe(false);
 expect(VisualCompareSchema.parse({baseline:{sessionId:'2026-09-11T01-02-03-004Z_abcdef12',screenshotId:'123e4567-e89b-42d3-a456-426614174000'},candidate:{sessionId:'2026-09-11T01-02-03-004Z_abcdef12',screenshotId:'123e4567-e89b-42d3-a456-426614174001'}})).toMatchObject({pixelThreshold:0,maxChangedPixelRatio:0});
 expect(PerformanceCompareSchema.parse({baselineId:'123e4567-e89b-42d3-a456-426614174000',candidateId:'123e4567-e89b-42d3-a456-426614174001'}).budgets).toEqual({maxFpsDropRatio:.1,maxFrameTimeIncreaseRatio:.2,maxNodeIncreaseRatio:.2,maxObjectIncreaseRatio:.2});
 expect(BridgeProjectEventSchema.safeParse({type:'event',protocol:1,sessionId:'s',sequence:1,event:'project.changed',data:{kind:'scene.saved',path:'res://a.tscn',dropped:0,extra:true}}).success).toBe(false);
});
