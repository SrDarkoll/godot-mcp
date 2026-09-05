import { SERVER_VERSION } from '@godot-mcp/protocol';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { Session } from '../session/session.js';
import { getProjectInfo } from '../tools/project-info.js';
import { getSceneTree } from '../tools/scene-tree.js';
import { getSessionStatus } from '../tools/session-status.js';
import { toolError, toolSuccess } from './tool-result.js';

export interface McpServerContext {
  session: Session;
  bridge: BridgeServer;
}

export function createMcpServer(ctx: McpServerContext): McpServer {
  const server = new McpServer({ name: 'godot-mcp', version: SERVER_VERSION });

  server.registerTool('session.status', {
    description: 'Return the active Godot MCP session and editor/runtime connection state.',
    inputSchema: z.object({})
  }, async () => toolSuccess(getSessionStatus(ctx.session)));

  server.registerTool('project.info', {
    description: 'Inspect the active Godot project through the connected editor addon.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await getProjectInfo(ctx.bridge.rpc));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('scene.get_tree', {
    description: 'Return the active edited scene tree with node names, classes, paths, and scripts.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await getSceneTree(ctx.bridge.rpc));
    } catch (error) {
      return toolError(error);
    }
  });

  return server;
}
