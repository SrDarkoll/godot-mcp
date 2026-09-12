import {
  VisualCompareSchema,
  PerformanceSnapshotSchema,
  PerformanceCompareSchema,
} from '@godot-mcp/protocol';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import type { VisualComparisonService } from '../visual/visual-comparison.js';
import { toolSuccess } from '../mcp/tool-result.js';
export function registerVisualComparisonTools(
  server: ToolRegistrar,
  service: VisualComparisonService,
) {
  server.registerTool(
    'visual.compare',
    {
      description:
        'Compare two retained screenshots pixel-for-pixel and retain a deterministic difference PNG/report. Requires identical dimensions.',
      inputSchema: VisualCompareSchema,
    },
    async (a) => toolSuccess(await service.compare(a)),
  );
  server.registerTool(
    'performance.snapshot',
    {
      description:
        'Sample relative runtime performance counters and retain the bounded evidence. Values depend on hardware/workload.',
      inputSchema: PerformanceSnapshotSchema,
    },
    async (a) => toolSuccess(await service.performanceSnapshot(a)),
  );
  server.registerTool(
    'performance.compare',
    {
      description:
        'Compare two retained performance snapshots using caller-provided relative regression budgets.',
      inputSchema: PerformanceCompareSchema,
    },
    async (a) => toolSuccess(await service.comparePerformance(a)),
  );
}
