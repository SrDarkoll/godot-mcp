import { expect, it } from 'vitest';
import { Capture2DParamsSchema, Capture3DParamsSchema, CapturePayloadSchema, GameCaptureParamsSchema } from '../src/visual.js';

it('defaults capture metadata and rejects caller-controlled paths and invalid indices', () => {
  expect(Capture2DParamsSchema.parse({})).toEqual({label:'capture', reason:'manual_request', checkpoint:false});
  for (const input of [{path:'../x'}, {label:' '}, {viewport_index:0}, {reason:'every_call'}]) {
    expect(Capture2DParamsSchema.safeParse(input).success).toBe(false);
  }
  for (const viewport_index of [-1, 4, 0.5]) expect(Capture3DParamsSchema.safeParse({viewport_index}).success).toBe(false);
  expect(Capture3DParamsSchema.parse({}).viewport_index).toBe(0);
});
it('bounds temporary game camera framing without changing editor capture arguments', () => {
  const framing={center:{x:120,y:-40},zoom:{x:2,y:2}};
  expect(GameCaptureParamsSchema.parse({framing}).framing).toEqual(framing);
  expect(Capture2DParamsSchema.safeParse({framing}).success).toBe(false);
  for(const invalid of [
    {center:{x:Infinity,y:0},zoom:{x:1,y:1}},
    {center:{x:0,y:0},zoom:{x:0,y:1}},
    {center:{x:0,y:0},zoom:{x:65,y:1}},
    {center:{x:0,y:0},zoom:{x:1,y:1},path:'res://main.tscn'}
  ]) expect(GameCaptureParamsSchema.safeParse({framing:invalid}).success).toBe(false);
});
it('rejects invalid capture dimensions and timestamps', () => {
  const payload = {png_base64:'YQ==', width:1, height:1, scene:null, captured_at:'2026-09-05T00:00:00Z', viewport_index:null};
  expect(CapturePayloadSchema.safeParse(payload).success).toBe(true);
  for (const patch of [{width:0}, {height:4097}, {captured_at:'yesterday'}, {png_base64:''}]) {
    expect(CapturePayloadSchema.safeParse({...payload,...patch}).success).toBe(false);
  }
});
