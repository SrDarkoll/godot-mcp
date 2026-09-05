import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { connectSignal, disconnectSignal, getSignalConnections, listSignals } from '../tools/signal-tools.js';
import { toolError, toolSuccess } from './tool-result.js';
export function registerSignalTools(registrar: ToolRegistrar, rpc: BridgeServer['rpc']): void {
    registrar.registerTool('signal.list', {
        description: 'List all signals declared on a node and its script.',
        inputSchema: z.object({
            node_path: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await listSignals(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('signal.connections', {
        description: 'List active signal connections on a node.',
        inputSchema: z.object({
            node_path: z.string(),
            signal_name: z.string().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await getSignalConnections(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('signal.connect', {
        description: 'Connect a signal from a source node to a target node method with Undo/Redo support.',
        inputSchema: z.object({
            source_node_path: z.string(),
            signal_name: z.string(),
            target_node_path: z.string(),
            target_method: z.string(),
            flags: z.number().optional()
        })
    }, async (args) => {
        try {
            return toolSuccess(await connectSignal(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('signal.disconnect', {
        description: 'Disconnect a signal between two nodes with Undo/Redo support.',
        inputSchema: z.object({
            source_node_path: z.string(),
            signal_name: z.string(),
            target_node_path: z.string(),
            target_method: z.string()
        })
    }, async (args) => {
        try {
            return toolSuccess(await disconnectSignal(rpc, args));
        }
        catch (error) {
            return toolError(error);
        }
    });
}
