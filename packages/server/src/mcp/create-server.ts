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
import {
  createScene,
  openScene,
  saveScene,
  saveSceneAs,
  reloadScene,
  instantiateScene,
  getSceneRoot
} from '../tools/scene-tools.js';
import {
  createNode,
  deleteNode,
  duplicateNode,
  renameNode,
  reparentNode,
  moveNode,
  inspectNode,
  listNodeChildren,
  getNodeProperty,
  setNodeProperty,
  getNodeProperties
} from '../tools/node-tools.js';
import {
  loadResource,
  inspectResource,
  createResource,
  setResourceProperty,
  saveResource,
  duplicateResource
} from '../tools/resource-tools.js';
import {
  createScript,
  attachScript,
  detachScript,
  inspectScript,
  validateScript
} from '../tools/script-tools.js';
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

  server.registerTool('scene.create', {
    description: 'Create a new scene with specified root node type and optional path.',
    inputSchema: z.object({
      root_type: z.string().default('Node2D'),
      root_name: z.string().optional(),
      path: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await createScene(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('scene.open', {
    description: 'Open a scene file in the Godot editor.',
    inputSchema: z.object({
      path: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await openScene(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('scene.save', {
    description: 'Save the currently edited scene.',
    inputSchema: z.object({
      path: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await saveScene(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('scene.save_as', {
    description: 'Save the currently edited scene to a new path.',
    inputSchema: z.object({
      path: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await saveSceneAs(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('scene.reload', {
    description: 'Reload a scene from disk in the editor.',
    inputSchema: z.object({
      path: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await reloadScene(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('scene.instantiate', {
    description: 'Instantiate a scene as a child of a node in the edited scene with Undo/Redo support.',
    inputSchema: z.object({
      path: z.string(),
      parent_path: z.string().optional(),
      name: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await instantiateScene(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('scene.get_root', {
    description: 'Get the root node info of the currently edited scene.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await getSceneRoot(ctx.bridge.rpc, {}));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.create', {
    description: 'Create a new node as a child of a parent node in the edited scene with Undo/Redo support.',
    inputSchema: z.object({
      parent_path: z.string().optional(),
      type: z.string(),
      name: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await createNode(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.delete', {
    description: 'Delete a node from the edited scene with Undo/Redo support.',
    inputSchema: z.object({
      node_path: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await deleteNode(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.duplicate', {
    description: 'Duplicate a node in the edited scene with Undo/Redo support.',
    inputSchema: z.object({
      node_path: z.string(),
      new_name: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await duplicateNode(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.rename', {
    description: 'Rename a node in the edited scene with Undo/Redo support.',
    inputSchema: z.object({
      node_path: z.string(),
      new_name: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await renameNode(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.reparent', {
    description: 'Reparent a node to a new parent in the edited scene with Undo/Redo support.',
    inputSchema: z.object({
      node_path: z.string(),
      new_parent_path: z.string(),
      keep_global_transform: z.boolean().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await reparentNode(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.move', {
    description: 'Move a node to a specific child index with Undo/Redo support.',
    inputSchema: z.object({
      node_path: z.string(),
      index: z.number()
    })
  }, async (args) => {
    try {
      return toolSuccess(await moveNode(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.inspect', {
    description: 'Inspect full details of a node (class, script, groups, children count, exported properties).',
    inputSchema: z.object({
      node_path: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await inspectNode(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.list_children', {
    description: 'List immediate children of a node.',
    inputSchema: z.object({
      node_path: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await listNodeChildren(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.get_property', {
    description: 'Get a single property value of a node.',
    inputSchema: z.object({
      node_path: z.string(),
      property: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await getNodeProperty(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.set_property', {
    description: 'Set a property value on a node with Undo/Redo support.',
    inputSchema: z.object({
      node_path: z.string(),
      property: z.string(),
      value: z.unknown()
    })
  }, async (args) => {
    try {
      return toolSuccess(await setNodeProperty(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('node.get_properties', {
    description: 'Get multiple or all exported property values of a node.',
    inputSchema: z.object({
      node_path: z.string(),
      properties: z.array(z.string()).optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await getNodeProperties(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('resource.load', {
    description: 'Load a resource file and inspect its exported properties.',
    inputSchema: z.object({
      path: z.string(),
      type_hint: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await loadResource(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('resource.inspect', {
    description: 'Inspect properties of a resource file.',
    inputSchema: z.object({
      path: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await inspectResource(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('resource.create', {
    description: 'Create and save a new resource of a specified type.',
    inputSchema: z.object({
      type: z.string(),
      path: z.string(),
      properties: z.record(z.string(), z.unknown()).optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await createResource(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('resource.set_property', {
    description: 'Set a property on a resource file and save it.',
    inputSchema: z.object({
      path: z.string(),
      property: z.string(),
      value: z.unknown()
    })
  }, async (args) => {
    try {
      return toolSuccess(await setResourceProperty(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('resource.save', {
    description: 'Save a loaded resource.',
    inputSchema: z.object({
      path: z.string(),
      flags: z.number().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await saveResource(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('resource.duplicate', {
    description: 'Duplicate a resource to a new path.',
    inputSchema: z.object({
      source_path: z.string(),
      target_path: z.string(),
      subresources: z.boolean().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await duplicateResource(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('script.create', {
    description: 'Create a new script file with an optional template.',
    inputSchema: z.object({
      path: z.string(),
      template: z.string().optional(),
      inherits: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await createScript(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('script.attach', {
    description: 'Attach a script to a node in the edited scene with Undo/Redo support.',
    inputSchema: z.object({
      node_path: z.string(),
      script_path: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await attachScript(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('script.detach', {
    description: 'Detach a script from a node in the edited scene with Undo/Redo support.',
    inputSchema: z.object({
      node_path: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await detachScript(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('script.inspect', {
    description: 'Inspect structure of a script (methods, properties, signals, base type).',
    inputSchema: z.object({
      path: z.string().optional(),
      node_path: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await inspectScript(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool('script.validate', {
    description: 'Validate GDScript syntax and compile checks without saving.',
    inputSchema: z.object({
      content: z.string(),
      path: z.string().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await validateScript(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  return server;
}
