import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { Session } from '../session/session.js';
import { getProjectInfo } from '../tools/project-info.js';
import { getSceneTree } from '../tools/scene-tree.js';
import { getSessionStatus } from '../tools/session-status.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { toolError, toolSuccess } from './tool-result.js';
export function registerCoreTools(registrar: ToolRegistrar, rpc: BridgeServer['rpc'], session: Session): void {
    registrar.registerTool('session.status', {
        description: 'Return the active Godot MCP session and editor/runtime connection state.',
        inputSchema: z.object({})
    }, async () => toolSuccess(getSessionStatus(session)));
    registrar.registerTool('project.info', {
        description: 'Inspect the active Godot project through the connected editor addon.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await getProjectInfo(rpc));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('scene.get_tree', {
        description: 'Return the active edited scene tree with node names, classes, paths, and scripts.',
        inputSchema: z.object({})
    }, async () => {
        try {
            return toolSuccess(await getSceneTree(rpc));
        }
        catch (error) {
            return toolError(error);
        }
    });
}
