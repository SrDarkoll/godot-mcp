import { describe, expect, it } from 'vitest';
import {
  HeadlessGetOutputSchema,
  HeadlessImportSchema,
  HeadlessRunSceneSchema,
  HeadlessRunSchema,
  HeadlessRunTestsSchema,
  HeadlessValidateProjectSchema
} from '../src/headless.js';

describe('headless protocol', () => {
  it('applies bounded timeout defaults and rejects oversized timeouts', () => {
    expect(HeadlessValidateProjectSchema.parse({}).timeout_ms).toBe(60_000);
    expect(HeadlessImportSchema.parse({}).timeout_ms).toBe(180_000);
    expect(HeadlessRunTestsSchema.parse({ script_path:'res://tests/smoke.gd' }).timeout_ms).toBe(120_000);
    expect(HeadlessRunTestsSchema.safeParse({script_path:'res://tests/smoke.gd',timeout_ms:600_001}).success).toBe(false);
  });

  it('rejects executable, cwd and raw argv injection fields', () => {
    expect(HeadlessRunSchema.safeParse({ executable:'cmd.exe' }).success).toBe(false);
    expect(HeadlessRunSchema.safeParse({ cwd:'C:/Windows' }).success).toBe(false);
    expect(HeadlessRunSceneSchema.safeParse({ scene_path:'res://main.tscn', argv:['--editor'] }).success).toBe(false);
    expect(HeadlessValidateProjectSchema.safeParse({ executable:'godot' }).success).toBe(false);
  });

  it('bounds output pagination', () => {
    expect(HeadlessGetOutputSchema.parse({})).toEqual({after:0,limit:100});
    expect(HeadlessGetOutputSchema.safeParse({limit:201}).success).toBe(false);
  });
});
