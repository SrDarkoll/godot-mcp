import { z } from 'zod/v4';

export const AddonCapabilitiesSchema = z.object({
  editor: z.boolean(),
  runtime: z.boolean(),
  debugger: z.boolean(),
  viewport2d: z.boolean(),
  viewport3d: z.boolean(),
  undoRedo: z.boolean()
});

export const AddonHelloSchema = z.object({
  type: z.literal('hello'),
  token: z.string().min(32),
  protocol: z.literal(1),
  addonVersion: z.string().min(1),
  godotVersion: z.string().min(1),
  projectRoot: z.string().min(1),
  capabilities: AddonCapabilitiesSchema
});

export type AddonCapabilities = z.infer<typeof AddonCapabilitiesSchema>;
export type AddonHello = z.infer<typeof AddonHelloSchema>;
