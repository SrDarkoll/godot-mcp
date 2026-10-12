import type { CallToolResult, InputRequiredResult } from '@modelcontextprotocol/server';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { formatUpdateNotice, type AvailableUpdate, type UpdateCheck } from './update-checker.js';

type Result = CallToolResult | InputRequiredResult;

export function withUpdateNotice(base: ToolRegistrar, checker: UpdateCheck, projectRoot: string): ToolRegistrar {
  let available: AvailableUpdate | null = null;
  let checking = false;
  const announced = new Set<string>();
  const refresh = () => {
    if (checking) return;
    checking = true;
    void Promise.resolve().then(() => checker.check()).then(update => { available = update; })
      .catch(() => {}).finally(() => { checking = false; });
  };
  refresh();

  const register = (name: string, config: any, handler: (...args: any[]) => Result | Promise<Result>) =>
    base.registerTool(name, config, async (...args: any[]): Promise<Result> => {
      const result = await handler(...args);
      refresh();
      // Approval responses have no content; keep their request state untouched.
      if (!('content' in result) || !Array.isArray(result.content) || !available || announced.has(available.latestVersion)) return result;
      announced.add(available.latestVersion);
      return {
        ...result,
        content: [...result.content, {
          type: 'text',
          text: formatUpdateNotice(available, projectRoot),
          annotations: { audience: ['user', 'assistant'], priority: 0.5 }
        }],
        _meta: { ...result._meta, 'godot-mcp/update': { ...available, projectRoot } }
      };
    });
  return { registerTool: register as ToolRegistrar['registerTool'] };
}
