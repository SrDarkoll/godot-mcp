import { SERVER_VERSION } from '@godot-mcp/protocol';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { BridgeServer } from '../bridge/bridge-server.js';
import type { Session } from '../session/session.js';
import { getProjectInfo } from '../tools/project-info.js';
import { getSceneTree } from '../tools/scene-tree.js';
import { getSessionStatus } from '../tools/session-status.js';
import {
  getObjectClass,
  getObjectPropertyList,
  getObjectMethodList,
  getObjectSignalList,
  getObjectProperty,
  setObjectProperty,
  callObjectMethod
} from '../tools/object-tools.js';
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

  server.registerTool('object.get_class', {
    description: 'Get the Godot class name of an object (node, resource, or instance id).',
    inputSchema: z.object({
      node_path: z.string().optional(),
      resource_path: z.string().optional(),
      object_id: z.number().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await getObjectClass(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('object.get_property_list', {
    description: 'Get the list of properties for an object.',
    inputSchema: z.object({
      node_path: z.string().optional(),
      resource_path: z.string().optional(),
      object_id: z.number().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await getObjectPropertyList(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('object.get_method_list', {
    description: 'Get the list of methods for an object.',
    inputSchema: z.object({
      node_path: z.string().optional(),
      resource_path: z.string().optional(),
      object_id: z.number().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await getObjectMethodList(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('object.get_signal_list', {
    description: 'Get the list of signals for an object.',
    inputSchema: z.object({
      node_path: z.string().optional(),
      resource_path: z.string().optional(),
      object_id: z.number().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await getObjectSignalList(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('object.get', {
    description: 'Get a property value on an object.',
    inputSchema: z.object({
      node_path: z.string().optional(),
      resource_path: z.string().optional(),
      object_id: z.number().optional(),
      property: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await getObjectProperty(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('object.set', {
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
      return toolSuccess(await setObjectProperty(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('object.call', {
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
      return toolSuccess(await callObjectMethod(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  return server;
}
