import * as z from 'zod/v4';
const session = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z_[a-f0-9]{8}$/);
const screenshot = z.strictObject({ sessionId: session, screenshotId: z.uuid() });
export const VisualCompareSchema = z.strictObject({
  baseline: screenshot,
  candidate: screenshot,
  pixelThreshold: z.number().int().min(0).max(255).default(0),
  maxChangedPixelRatio: z.number().min(0).max(1).default(0),
});
export const PerformanceSnapshotSchema = z.strictObject({
  samples: z.number().int().min(1).max(120).default(10),
  intervalMs: z.number().int().min(0).max(1000).default(100),
  label: z.string().trim().min(1).max(80).default('Performance snapshot'),
});
const ratio = z.number().min(0).max(10);
export const PerformanceCompareSchema = z.strictObject({
  baselineId: z.uuid(),
  candidateId: z.uuid(),
  budgets: z
    .strictObject({
      maxFpsDropRatio: ratio.default(0.1),
      maxFrameTimeIncreaseRatio: ratio.default(0.2),
      maxNodeIncreaseRatio: ratio.default(0.2),
      maxObjectIncreaseRatio: ratio.default(0.2),
    })
    .default({
      maxFpsDropRatio: 0.1,
      maxFrameTimeIncreaseRatio: 0.2,
      maxNodeIncreaseRatio: 0.2,
      maxObjectIncreaseRatio: 0.2,
    }),
});
