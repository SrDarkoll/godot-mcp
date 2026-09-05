import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { createScene, getSceneRoot, instantiateScene, openScene, reloadScene, saveScene, saveSceneAs } from '../tools/scene-tools.js';
import { toolError, toolSuccess } from './tool-result.js';
export function registerSceneTools(registrar: ToolRegistrar, rpc: BridgeServer['rpc']): void {
    registrar.registerTool('scene.create', {
        description: 'Create a new scene with specified root node type and optional path.',
        inputSchema: z.object({
            root_type: z.string().default('Node2D'),
            root_name: z.string().optional(),
            path: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await createScene(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('scene.open', {
        description: 'Open a scene file in the Godot editor.',
        inputSchema: z.object({
            path: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await openScene(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('scene.save', {
        description: 'Save the currently edited scene.',
        inputSchema: z.object({
            path: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await saveScene(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('scene.save_as', {
        description: 'Save the currently edited scene to a new path.',
        inputSchema: z.object({
            path: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await saveSceneAs(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('scene.reload', {
        description: 'Reload a scene from disk in the editor.',
        inputSchema: z.object({
            path: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await reloadScene(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('scene.instantiate', {
        description: 'Instantiate a scene as a child of a node in the edited scene with Undo/Redo support.',
        inputSchema: z.object({
            path: z.string(),
            parent_path: z.string().optional(),
            name: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await instantiateScene(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('scene.get_root', {
        description: 'Get the root node info of the currently edited scene.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await getSceneRoot(rpc, {}));
        }
        catch (error) {
            return toolError(error);
        }
    });
}
