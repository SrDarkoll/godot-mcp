import * as z from 'zod/v4';

export const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
export const MAX_BRIDGE_PAYLOAD = 24 * 1024 * 1024;
export const VisualReasonSchema = z.enum(['manual_request', 'after_visual_change', 'after_visual_fix',
  'before_major_change', 'after_major_change', 'on_error']);
export const Capture2DParamsSchema = z.strictObject({
  label: z.string().trim().min(1).max(80).default('capture'),
  reason: VisualReasonSchema.default('manual_request'),
  checkpoint: z.boolean().default(false)
});
export const Capture3DParamsSchema = Capture2DParamsSchema.extend({
  viewport_index: z.number().int().min(0).max(3).default(0)
});
export const CapturePayloadSchema = z.strictObject({
  png_base64: z.string().min(1).max(Math.ceil(MAX_CAPTURE_BYTES / 3) * 4),
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
  scene: z.string().nullable(),
  captured_at: z.iso.datetime(),
  viewport_index: z.number().int().min(0).max(3).nullable()
});
export type Capture2DParams = z.infer<typeof Capture2DParamsSchema>;
export type Capture3DParams = z.infer<typeof Capture3DParamsSchema>;
export type CapturePayload = z.infer<typeof CapturePayloadSchema>;
export const GameCapturePayloadSchema=CapturePayloadSchema.extend({run_id:z.uuid()});
