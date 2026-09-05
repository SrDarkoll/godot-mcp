import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { createResource, duplicateResource, inspectResource, loadResource, saveResource, setResourceProperty } from '../tools/resource-tools.js';
import { toolError, toolSuccess } from './tool-result.js';
export function registerResourceTools(registrar: ToolRegistrar, rpc: BridgeServer['rpc']): void {
    registrar.registerTool('resource.load', {
        description: 'Load a resource file and inspect its exported properties.',
        inputSchema: z.object({
            path: z.string(),
            type_hint: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await loadResource(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('resource.inspect', {
        description: 'Inspect properties of a resource file.',
        inputSchema: z.object({
            path: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await inspectResource(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('resource.create', {
        description: 'Create and save a new resource of a specified type.',
        inputSchema: z.object({
            type: z.string(),
            path: z.string(),
            properties: z.record(z.string(), z.unknown()).optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await createResource(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('resource.set_property', {
        description: 'Set a property on a resource file and save it.',
        inputSchema: z.object({
            path: z.string(),
            property: z.string(),
            value: z.unknown()
        })
    }, async (args) => {
        try {
            return toolSuccess(await setResourceProperty(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('resource.save', {
        description: 'Save a loaded resource.',
        inputSchema: z.object({
            path: z.string(),
            flags: z.number().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await saveResource(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('resource.duplicate', {
        description: 'Duplicate a resource to a new path.',
        inputSchema: z.object({
            source_path: z.string(),
            target_path: z.string(),
            subresources: z.boolean().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await duplicateResource(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
}
