import { SERVER_VERSION, Capture2DParamsSchema, Capture3DParamsSchema } from '@godot-mcp/protocol';
import { SessionStore } from '../session/session-store.js';
import { VisualTools } from '../tools/visual-tools.js';
import { getSessionManifest } from '../tools/session-manifest.js';
import {RuntimeService} from '../runtime/runtime-service.js';
import {registerRuntimeTools} from '../tools/runtime-tools.js';
import {registerDebugTools} from '../tools/debug-tools.js';
import {RecoveryService} from '../recovery/recovery-service.js';
import {ToolPolicy} from '../security/tool-policy.js';
import {guardedRegistrar} from '../security/tool-registrar.js';
import {registerRecoveryTools} from '../tools/recovery-tools.js';
import {registerSecurityTools} from '../tools/security-tools.js';
import {registerObservabilityTools} from '../tools/observability-tools.js';
import {HeadlessValidator} from '../project/headless-validator.js';
import {registerProjectValidationTools} from '../tools/project-validation-tools.js';
import {registerBatchTools} from '../tools/batch-tools.js';
import {registerProjectEventTools} from '../tools/project-event-tools.js';
import {registerDependencyTools} from '../tools/dependency-tools.js';
import {VisualComparisonService} from '../visual/visual-comparison.js';
import {registerVisualComparisonTools} from '../tools/visual-comparison-tools.js';
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
import {
  listSignals,
  getSignalConnections,
  connectSignal,
  disconnectSignal
} from '../tools/signal-tools.js';
import {
  getProjectSetting,
  setProjectSetting,
  listInputActions,
  addInputAction,
  removeInputAction
} from '../tools/project-settings-tools.js';
import {
  getActiveScene,
  getOpenScenes,
  getSelectedNodes,
  selectNode,
  changeScene,
  editorUndo,
  editorRedo,
  getFilesystem,
  scanFilesystem
} from '../tools/editor-tools.js';
import { toolError, toolSuccess, toolImageSuccess } from './tool-result.js';

export interface McpServerContext {
  session: Session;
  bridge: BridgeServer;
  sessions: SessionStore;
  visual?: VisualTools;
  runtime?: RuntimeService;
  recovery?: RecoveryService;
  policy?: ToolPolicy;
}

export function createMcpServer(ctx: McpServerContext): McpServer {
  const server = new McpServer({ name: 'godot-mcp', version: SERVER_VERSION });
  const recovery=ctx.recovery??new RecoveryService(ctx.session,ctx.sessions,ctx.bridge);
  const policy=ctx.policy??new ToolPolicy(ctx.session,ctx.sessions,recovery);
  const registrar=guardedRegistrar(server,policy,()=>ctx.bridge.capabilities);
  const runtime=ctx.runtime??new RuntimeService(ctx.session,ctx.sessions,ctx.bridge);
  const visual = ctx.visual ?? new VisualTools(ctx.session,ctx.sessions,ctx.bridge,runtime);
  registerRuntimeTools(registrar,runtime);
  registerDebugTools(registrar,runtime);
  registerRecoveryTools(registrar,recovery,ctx.bridge.rpc);
  registerSecurityTools(registrar,policy);
  registerObservabilityTools(registrar,policy,ctx.sessions,ctx.session.id);
  registerProjectValidationTools(registrar,new HeadlessValidator(ctx.session,ctx.sessions));
  registerBatchTools(registrar,recovery,ctx.bridge.rpc);
  registerProjectEventTools(registrar,ctx.bridge.projectEvents);
  registerDependencyTools(registrar,ctx.bridge.rpc,recovery);
  registerVisualComparisonTools(registrar,new VisualComparisonService(ctx.session,ctx.sessions,async()=>await runtime.request('debug.performance') as any));
  registrar.registerTool('visual.capture_game',{description:'Capture the running game viewport to a persistent PNG; requires an owned graphical runtime.',inputSchema:Capture2DParamsSchema},async args=>{
    try{const capture=await visual.capture('game',args);return toolImageSuccess(capture.result,capture.data);}catch(error){return toolError(error);}
  });
  registrar.registerTool('session.manifest', {
    description:'Read the persistent manifest of the current session, including screenshots and visual checkpoints.',
    inputSchema:z.strictObject({})
  },async () => {
    try {return toolSuccess(await getSessionManifest(ctx.sessions,ctx.session.id));}
    catch(error) {return toolError(error);}
  });
  registrar.registerTool('visual.capture_viewport_2d', {
    description:'Activate the 2D editor tab and capture its viewport as a persistent PNG. Requires a graphical editor.',
    inputSchema:Capture2DParamsSchema
  },async args => {
    try {const capture=await visual.capture('editor_2d',args);return toolImageSuccess(capture.result,capture.data);}
    catch(error) {return toolError(error);}
  });
  registrar.registerTool('visual.capture_viewport_3d', {
    description:'Activate the 3D editor tab and capture the requested visible viewport (0-3) as a persistent PNG.',
    inputSchema:Capture3DParamsSchema
  },async args => {
    try {const capture=await visual.capture('editor_3d',args);return toolImageSuccess(capture.result,capture.data);}
    catch(error) {return toolError(error);}
  });

  registrar.registerTool('session.status', {
    description: 'Return the active Godot MCP session and editor/runtime connection state.',
    inputSchema: z.object({})
  }, async () => toolSuccess(getSessionStatus(ctx.session)));

  registrar.registerTool('project.info', {
    description: 'Inspect the active Godot project through the connected editor addon.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await getProjectInfo(ctx.bridge.rpc));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('scene.get_tree', {
    description: 'Return the active edited scene tree with node names, classes, paths, and scripts.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await getSceneTree(ctx.bridge.rpc));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('object.get_class', {
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

  registrar.registerTool('object.get_property_list', {
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

  registrar.registerTool('object.get_method_list', {
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

  registrar.registerTool('object.get_signal_list', {
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
      return toolSuccess(await getObjectProperty(ctx.bridge.rpc, args));
    } catch (error) {
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
      return toolSuccess(await setObjectProperty(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('object.call', {
    description: 'Call a class-allowlisted native method within the edited scene/project. Custom scripts require trusted_script, editor.script_methods permission and confirmation; trusted code is not sandboxed.',
    inputSchema: z.object({
      node_path: z.string().optional(),
      resource_path: z.string().optional(),
      object_id: z.number().optional(),
      method: z.string(),
      trusted_script: z.boolean().optional(),
      args: z.array(z.unknown()).optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await callObjectMethod(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('scene.create', {
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

  registrar.registerTool('scene.open', {
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

  registrar.registerTool('scene.save', {
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

  registrar.registerTool('scene.save_as', {
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

  registrar.registerTool('scene.reload', {
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

  registrar.registerTool('scene.instantiate', {
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

  registrar.registerTool('scene.get_root', {
    description: 'Get the root node info of the currently edited scene.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await getSceneRoot(ctx.bridge.rpc, {}));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('node.create', {
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

  registrar.registerTool('node.delete', {
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

  registrar.registerTool('node.duplicate', {
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

  registrar.registerTool('node.rename', {
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

  registrar.registerTool('node.reparent', {
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

  registrar.registerTool('node.move', {
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

  registrar.registerTool('node.inspect', {
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

  registrar.registerTool('node.list_children', {
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

  registrar.registerTool('node.get_property', {
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

  registrar.registerTool('node.set_property', {
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

  registrar.registerTool('node.get_properties', {
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

  registrar.registerTool('resource.load', {
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

  registrar.registerTool('resource.inspect', {
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

  registrar.registerTool('resource.create', {
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

  registrar.registerTool('resource.set_property', {
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

  registrar.registerTool('resource.save', {
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

  registrar.registerTool('resource.duplicate', {
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

  registrar.registerTool('script.create', {
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

  registrar.registerTool('script.attach', {
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

  registrar.registerTool('script.detach', {
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

  registrar.registerTool('script.inspect', {
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

  registrar.registerTool('script.validate', {
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

  registrar.registerTool('signal.list', {
    description: 'List all signals declared on a node and its script.',
    inputSchema: z.object({
      node_path: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await listSignals(ctx.bridge.rpc, args));
    } catch (error) {
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
      return toolSuccess(await getSignalConnections(ctx.bridge.rpc, args));
    } catch (error) {
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
      return toolSuccess(await connectSignal(ctx.bridge.rpc, args));
    } catch (error) {
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
      return toolSuccess(await disconnectSignal(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('project.settings.get', {
    description: 'Get a project setting value from project.godot.',
    inputSchema: z.object({
      setting: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await getProjectSetting(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('project.settings.set', {
    description: 'Set a project setting value and optionally save to project.godot.',
    inputSchema: z.object({
      setting: z.string(),
      value: z.unknown(),
      save: z.boolean().optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await setProjectSetting(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('project.input.list', {
    description: 'List all input actions and their assigned events from InputMap.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await listInputActions(ctx.bridge.rpc, {}));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('project.input.add_action', {
    description: 'Add an action to the InputMap and persist in project settings.',
    inputSchema: z.object({
      action: z.string(),
      deadzone: z.number().optional(),
      events: z.array(z.record(z.string(), z.unknown())).optional()
    })
  }, async (args) => {
    try {
      return toolSuccess(await addInputAction(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('project.input.remove_action', {
    description: 'Remove an action from the InputMap and project settings.',
    inputSchema: z.object({
      action: z.string()
    })
  }, async (args) => {
    try {
      return toolSuccess(await removeInputAction(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('editor.get_active_scene', {
    description: 'Get information about the currently active edited scene tab.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await getActiveScene(ctx.bridge.rpc, {}));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('editor.get_open_scenes', {
    description: 'Get list of open scene paths in the editor.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await getOpenScenes(ctx.bridge.rpc, {}));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('editor.get_selected_nodes', {
    description: 'Get currently selected nodes in the editor scene tree.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await getSelectedNodes(ctx.bridge.rpc, {}));
    } catch (error) {
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
      return toolSuccess(await selectNode(ctx.bridge.rpc, args));
    } catch (error) {
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
      return toolSuccess(await changeScene(ctx.bridge.rpc, args));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('editor.undo', {
    description: 'Trigger Undo in the Godot editor.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await editorUndo(ctx.bridge.rpc, {}));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('editor.redo', {
    description: 'Trigger Redo in the Godot editor.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await editorRedo(ctx.bridge.rpc, {}));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('editor.get_filesystem', {
    description: 'Get filesystem directory and file structure under res://.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await getFilesystem(ctx.bridge.rpc, {}));
    } catch (error) {
      return toolError(error);
    }
  });

  registrar.registerTool('editor.scan_filesystem', {
    description: 'Request a rescan of the project filesystem in the editor.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return toolSuccess(await scanFilesystem(ctx.bridge.rpc, {}));
    } catch (error) {
      return toolError(error);
    }
  });

  return server;
}
