import * as z from 'zod/v4';

const nodePath = z.string().min(1).max(1024).refine(value =>
  !value.includes('..') && !value.includes('\\') &&
  !value.includes('\0') && !value.includes(':') && !value.includes('//'),
  'Expected a scene node path such as /Main/CentralCross or CentralCross relative to the edited scene root');
const boundedDistance = z.number().finite().min(0).max(4096);

export const GeometryConnectionSchema = z.strictObject({
  from: nodePath,
  from_end: z.enum(['start', 'end']),
  to: nodePath,
  to_end: z.enum(['start', 'end']),
  max_gap_px: boundedDistance
});

export const GeometryValidateSchema = z.strictObject({
  routes: z.array(nodePath).min(1).max(32),
  obstacles: z.array(nodePath).min(1).max(64),
  connections: z.array(GeometryConnectionSchema).max(64).default([]),
  agent_radius_px: z.number().finite().min(0).max(256).default(0),
  max_findings: z.number().int().min(1).max(100).default(100)
}).superRefine((value, context) => {
  if (new Set(value.routes).size !== value.routes.length ||
      new Set(value.obstacles).size !== value.obstacles.length)
    context.addIssue({ code: 'custom', message: 'Duplicate route or obstacle path' });
  const routes = new Set(value.routes);
  for (const connection of value.connections)
    if (!routes.has(connection.from) || !routes.has(connection.to))
      context.addIssue({ code: 'custom', message: 'Connections must name declared routes' });
});

export type GeometryValidateInput = z.infer<typeof GeometryValidateSchema>;
