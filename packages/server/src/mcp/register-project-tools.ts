import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { addInputAction, getProjectSetting, listInputActions, removeInputAction, setProjectSetting } from '../tools/project-settings-tools.js';
import { toolError, toolSuccess } from './tool-result.js';
export function registerProjectTools(registrar: ToolRegistrar, rpc: BridgeServer['rpc']): void {
    registrar.registerTool('project.settings.get', {
        description: 'Get a project setting value from project.godot.',
        inputSchema: z.object({
            setting: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await getProjectSetting(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('project.settings.set', {
        description: 'Set a project setting value and optionally save to project.godot.',
        inputSchema: z.object({
            setting: z.string(),
            value: z.unknown(),
            save: z.boolean().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await setProjectSetting(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('project.input.list', {
        description: 'List all input actions and their assigned events from InputMap.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await listInputActions(rpc, {}));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('project.input.add_action', {
        description: 'Add an action to the InputMap and persist in project settings.',
        inputSchema: z.object({
            action: z.string(),
            deadzone: z.number().optional(),
            events: z.array(z.record(z.string(), z.unknown())).optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await addInputAction(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('project.input.remove_action', {
        description: 'Remove an action from the InputMap and project settings.',
        inputSchema: z.object({
            action: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await removeInputAction(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
}
