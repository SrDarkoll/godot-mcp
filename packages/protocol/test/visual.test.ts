import { expect, it } from 'vitest';
import { Capture2DParamsSchema, Capture3DParamsSchema, CapturePayloadSchema } from '../src/visual.js';

it('defaults capture metadata and rejects caller-controlled paths and invalid indices', () => {
  expect(Capture2DParamsSchema.parse({})).toEqual({label:'capture', reason:'manual_request', checkpoint:false});
  for (const input of [{path:'../x'}, {label:' '}, {viewport_index:0}, {reason:'every_call'}]) {
    expect(Capture2DParamsSchema.safeParse(input).success).toBe(false);
  }
  for (const viewport_index of [-1, 4, 0.5]) expect(Capture3DParamsSchema.safeParse({viewport_index}).success).toBe(false);
  expect(Capture3DParamsSchema.parse({}).viewport_index).toBe(0);
});
it('rejects invalid capture dimensions and timestamps', () => {
  const payload = {png_base64:'YQ==', width:1, height:1, scene:null, captured_at:'2026-09-05T00:00:00Z', viewport_index:null};
  expect(CapturePayloadSchema.safeParse(payload).success).toBe(true);
  for (const patch of [{width:0}, {height:4097}, {captured_at:'yesterday'}, {png_base64:''}]) {
    expect(CapturePayloadSchema.safeParse({...payload,...patch}).success).toBe(false);
  }
});
