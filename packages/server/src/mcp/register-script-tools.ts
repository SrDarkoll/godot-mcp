import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { attachScript, createScript, detachScript, inspectScript, validateScript } from '../tools/script-tools.js';
import { toolError, toolSuccess } from './tool-result.js';
export function registerScriptTools(registrar: ToolRegistrar, rpc: BridgeServer['rpc']): void {
    registrar.registerTool('script.create', {
        description: 'Create a new script file with an optional template.',
        inputSchema: z.object({
            path: z.string(),
            template: z.string().optional(),
            inherits: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await createScript(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('script.attach', {
        description: 'Attach a script to a node in the edited scene with Undo/Redo support.',
        inputSchema: z.object({
            node_path: z.string(),
            script_path: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await attachScript(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('script.detach', {
        description: 'Detach a script from a node in the edited scene with Undo/Redo support.',
        inputSchema: z.object({
            node_path: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await detachScript(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('script.inspect', {
        description: 'Inspect structure of a script (methods, properties, signals, base type).',
        inputSchema: z.object({
            path: z.string().optional(),
            node_path: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await inspectScript(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('script.validate', {
        description: 'Validate GDScript syntax and compile checks without saving.',
        inputSchema: z.object({
            content: z.string(),
            path: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await validateScript(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
}
