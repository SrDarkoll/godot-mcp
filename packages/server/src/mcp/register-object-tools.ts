import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { callObjectMethod, getObjectClass, getObjectMethodList, getObjectProperty, getObjectPropertyList, getObjectSignalList, setObjectProperty } from '../tools/object-tools.js';
import { toolError, toolSuccess } from './tool-result.js';
export function registerObjectTools(registrar: ToolRegistrar, rpc: BridgeServer['rpc']): void {
    registrar.registerTool('object.get_class', {
        description: 'Get the Godot class name of an object (node, resource, or instance id).',
        inputSchema: z.object({
            node_path: z.string().optional(),
            resource_path: z.string().optional(),
            object_id: z.number().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await getObjectClass(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('object.get_property_list', {
        description: 'Get the list of properties for an object.',
        inputSchema: z.object({
            node_path: z.string().optional(),
            resource_path: z.string().optional(),
            object_id: z.number().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await getObjectPropertyList(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('object.get_method_list', {
        description: 'Get the list of methods for an object.',
        inputSchema: z.object({
            node_path: z.string().optional(),
            resource_path: z.string().optional(),
            object_id: z.number().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await getObjectMethodList(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('object.get_signal_list', {
        description: 'Get the list of signals for an object.',
        inputSchema: z.object({
            node_path: z.string().optional(),
            resource_path: z.string().optional(),
            object_id: z.number().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await getObjectSignalList(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('object.get', {
        description: 'Get a property value on an object.',
        inputSchema: z.object({
            node_path: z.string().optional(),
            resource_path: z.string().optional(),
            object_id: z.number().optional(),
            property: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await getObjectProperty(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('object.set', {
        description: 'Set a property value on an object.',
        inputSchema: z.object({
            node_path: z.string().optional(),
            resource_path: z.string().optional(),
            object_id: z.number().optional(),
            property: z.string(),
            value: z.unknown()
        })
    }, async (args) => {
        try {
            return toolSuccess(await setObjectProperty(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('object.call', {
        description: 'Call an allowed method on an object.',
        inputSchema: z.object({
            node_path: z.string().optional(),
            resource_path: z.string().optional(),
            object_id: z.number().optional(),
            method: z.string(),
            args: z.array(z.unknown()).optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await callObjectMethod(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
}
