import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { createNode, deleteNode, duplicateNode, getNodeProperties, getNodeProperty, inspectNode, listNodeChildren, moveNode, renameNode, reparentNode, setNodeProperty } from '../tools/node-tools.js';
import { toolError, toolSuccess } from './tool-result.js';
export function registerNodeTools(registrar: ToolRegistrar, rpc: BridgeServer['rpc']): void {
    registrar.registerTool('node.create', {
        description: 'Create a new node as a child of a parent node in the edited scene with Undo/Redo support.',
        inputSchema: z.object({
            parent_path: z.string().optional(),
            type: z.string(),
            name: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await createNode(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('node.delete', {
        description: 'Delete a node from the edited scene with Undo/Redo support.',
        inputSchema: z.object({
            node_path: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await deleteNode(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('node.duplicate', {
        description: 'Duplicate a node in the edited scene with Undo/Redo support.',
        inputSchema: z.object({
            node_path: z.string(),
            new_name: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await duplicateNode(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('node.rename', {
        description: 'Rename a node in the edited scene with Undo/Redo support.',
        inputSchema: z.object({
            node_path: z.string(),
            new_name: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await renameNode(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('node.reparent', {
        description: 'Reparent a node to a new parent in the edited scene with Undo/Redo support.',
        inputSchema: z.object({
            node_path: z.string(),
            new_parent_path: z.string(),
            keep_global_transform: z.boolean().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await reparentNode(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('node.move', {
        description: 'Move a node to a specific child index with Undo/Redo support.',
        inputSchema: z.object({
            node_path: z.string(),
            index: z.number()
        })
    }, async (args) => {
        try {
            return toolSuccess(await moveNode(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('node.inspect', {
        description: 'Inspect full details of a node (class, script, groups, children count, exported properties).',
        inputSchema: z.object({
            node_path: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await inspectNode(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('node.list_children', {
        description: 'List immediate children of a node.',
        inputSchema: z.object({
            node_path: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await listNodeChildren(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('node.get_property', {
        description: 'Get a single property value of a node.',
        inputSchema: z.object({
            node_path: z.string(),
            property: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await getNodeProperty(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('node.set_property', {
        description: 'Set a property value on a node with Undo/Redo support.',
        inputSchema: z.object({
            node_path: z.string(),
            property: z.string(),
            value: z.unknown()
        })
    }, async (args) => {
        try {
            return toolSuccess(await setNodeProperty(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('node.get_properties', {
        description: 'Get multiple or all exported property values of a node.',
        inputSchema: z.object({
            node_path: z.string(),
            properties: z.array(z.string()).optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await getNodeProperties(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
}
