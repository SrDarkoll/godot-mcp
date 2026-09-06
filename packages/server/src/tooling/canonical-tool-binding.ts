import * as z from 'zod/v4';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { toolError, toolSuccess } from '../mcp/tool-result.js';

export const CANONICAL_TOOL_BINDING_MARKER = Symbol('godot-mcp.canonical-tool-binding');

export interface CanonicalToolBinding<
  Name extends string,
  Schema extends z.ZodType,
  Context,
  Result extends object
> {
  readonly name: Name;
  readonly inputSchema: Schema;
  readonly handler: (context: Context, args: z.output<Schema>) => Result | Promise<Result>;
}

export function defineCanonicalToolBinding<
  const Name extends string,
  Schema extends z.ZodType,
  Context,
  Result extends object
>(
  name: Name,
  definition: {
    inputSchema: Schema;
    handler: (context: Context, args: z.output<Schema>) => Result | Promise<Result>;
  }
): CanonicalToolBinding<Name, Schema, Context, Result> {
  return Object.freeze({ name, inputSchema: definition.inputSchema, handler: definition.handler });
}

export function bindCanonicalTool<
  const Name extends string,
  Schema extends z.ZodType,
  Context,
  Result extends object
>(
  registrar: ToolRegistrar,
  binding: CanonicalToolBinding<Name, Schema, Context, Result>,
  context: Context,
  options: { mapArgs?: (args: z.output<Schema>) => z.output<Schema> } = {}
): void {
  const config = {
    inputSchema: binding.inputSchema,
    [CANONICAL_TOOL_BINDING_MARKER]: binding.name
  };
  registrar.registerTool(binding.name, config as never, (async (args: z.output<Schema>) => {
    try {
      const mapped = options.mapArgs ? options.mapArgs(args) : args;
      return toolSuccess(await binding.handler(context, mapped));
    } catch (error) {
      return toolError(error);
    }
  }) as never);
}
