import { z } from 'zod/v4';

export const CapabilityStatusSchema = z.enum(['supported', 'restricted', 'unsupported']);

export const CapabilityEntrySchema = z.strictObject({
  status: CapabilityStatusSchema,
  reason: z.string().min(1).optional()
});

export const CompatibilityQuirkSchema = z.strictObject({
  active: z.boolean(),
  reason: z.string().min(1).optional()
});

export const EngineVersionInfoSchema = z.strictObject({
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
  patch: z.number().int().nonnegative(),
  status: z.string(),
  build: z.string(),
  hash: z.string(),
  string: z.string().min(1)
});

export const CompatibilityCapabilitiesSchema = z.strictObject({
  'navigation.region.2d': CapabilityEntrySchema.optional(),
  'navigation.region.3d': CapabilityEntrySchema.optional(),
  'navigation.mesh.bake.2d': CapabilityEntrySchema.optional(),
  'navigation.mesh.bake.3d': CapabilityEntrySchema.optional(),
  'navigation.agent.2d': CapabilityEntrySchema.optional(),
  'navigation.agent.3d': CapabilityEntrySchema.optional(),
  'navigation.agent3d.keep_y_velocity': CapabilityEntrySchema.optional(),
  'visual.viewport2d.capture': CapabilityEntrySchema.optional(),
  'visual.viewport3d.capture': CapabilityEntrySchema.optional()
});

export const CompatibilityQuirksSchema = z.strictObject({
  'navigation.agent3d.keep_y_velocity.hidden_with_3d_avoidance': CompatibilityQuirkSchema.optional()
});

export const CompatibilityManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  engine: EngineVersionInfoSchema,
  capabilities: CompatibilityCapabilitiesSchema,
  quirks: CompatibilityQuirksSchema
});

export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;
export type CapabilityEntry = z.infer<typeof CapabilityEntrySchema>;
export type CompatibilityQuirk = z.infer<typeof CompatibilityQuirkSchema>;
export type EngineVersionInfo = z.infer<typeof EngineVersionInfoSchema>;
export type CompatibilityManifest = z.infer<typeof CompatibilityManifestSchema>;
