import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { changeScene, editorRedo, editorUndo, getActiveScene, getFilesystem, getOpenScenes, getSelectedNodes, scanFilesystem, selectNode } from '../tools/editor-tools.js';
import { toolError, toolSuccess } from './tool-result.js';
export function registerEditorTools(registrar: ToolRegistrar, rpc: BridgeServer['rpc']): void {
    registrar.registerTool('editor.get_active_scene', {
        description: 'Get information about the currently active edited scene tab.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await getActiveScene(rpc, {}));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('editor.get_open_scenes', {
        description: 'Get list of open scene paths in the editor.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await getOpenScenes(rpc, {}));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('editor.get_selected_nodes', {
        description: 'Get currently selected nodes in the editor scene tree.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await getSelectedNodes(rpc, {}));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('editor.select_node', {
        description: 'Select a node in the editor scene tree.',
        inputSchema: z.object({
            node_path: z.string(),
            additive: z.boolean().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await selectNode(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('editor.change_scene', {
        description: 'Switch active scene tab to a given scene path.',
        inputSchema: z.object({
            path: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await changeScene(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('editor.undo', {
        description: 'Trigger Undo in the Godot editor.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await editorUndo(rpc, {}));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('editor.redo', {
        description: 'Trigger Redo in the Godot editor.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await editorRedo(rpc, {}));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('editor.get_filesystem', {
        description: 'Get filesystem directory and file structure under res://.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await getFilesystem(rpc, {}));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('editor.scan_filesystem', {
        description: 'Request a rescan of the project filesystem in the editor.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await scanFilesystem(rpc, {}));
        }
        catch (error) {
            return toolError(error);
        }
    });
}
