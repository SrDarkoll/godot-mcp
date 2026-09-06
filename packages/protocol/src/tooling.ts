import * as z from 'zod/v4';

export const ToolProfileSchema = z.enum(['minimal','core','2d','3d','navigation','ui','runtime','full']);
export const ToolDomainSchema = z.enum([
  'core','session','security','recovery','scene','node','object','resource','script','signal','project','editor',
  'runtime','debug','visual','workflow','ui','animation','tilemap','tileset','2d','3d','materials','navigation'
]);

const ToolDiscoveryParamsBaseSchema = z.strictObject({
  profile: ToolProfileSchema.optional(),
  domain: ToolDomainSchema.optional(),
  query: z.string().trim().min(1).max(80).optional(),
  activeOnly: z.boolean().optional(),
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(50).default(25)
});

export const ToolDiscoveryParamsSchema = ToolDiscoveryParamsBaseSchema.transform(value => ({
  ...value,
  activeOnly: value.activeOnly ?? value.profile === undefined
}));

export const ToolCatalogEntrySchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  domain: ToolDomainSchema,
  description: z.string().min(1).max(2000),
  active: z.boolean(),
  profiles: z.array(ToolProfileSchema).min(1).max(8)
});

export const ToolProfileSummarySchema = z.strictObject({
  id: ToolProfileSchema,
  toolCount: z.number().int().min(1).max(10000)
});

export const ToolDiscoveryResultSchema = z.strictObject({
  activeProfile: ToolProfileSchema,
  selectedProfile: ToolProfileSchema,
  profiles: z.array(ToolProfileSummarySchema).length(ToolProfileSchema.options.length),
  total: z.number().int().min(0).max(10000),
  offset: z.number().int().min(0).max(10000),
  limit: z.number().int().min(1).max(50),
  nextOffset: z.number().int().min(1).max(10000).nullable(),
  tools: z.array(ToolCatalogEntrySchema).max(50)
});

export type ToolProfile = z.infer<typeof ToolProfileSchema>;
export type ToolDomain = z.infer<typeof ToolDomainSchema>;
export type ToolDiscoveryParams = z.infer<typeof ToolDiscoveryParamsSchema>;
export type ToolCatalogEntry = z.infer<typeof ToolCatalogEntrySchema>;
export type ToolProfileSummary = z.infer<typeof ToolProfileSummarySchema>;
export type ToolDiscoveryResult = z.infer<typeof ToolDiscoveryResultSchema>;
