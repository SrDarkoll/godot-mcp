export interface SessionStatusResult {
  sessionId: string;
  projectRoot: string;
  editorConnected: boolean;
  runtimeConnected: boolean;
  godotVersion: string | null;
  addonVersion: string | null;
  protocolVersion: 1;
}

export interface ProjectInfoResult {
  name: string;
  projectRoot: string;
  projectFile: string;
  godotVersion: string;
  activeScene: string | null;
}

export interface SceneTreeNode {
  name: string;
  type: string;
  path: string;
  script: string | null;
  children: SceneTreeNode[];
}

export interface SceneTreeResult {
  scenePath: string | null;
  root: SceneTreeNode | null;
}

export interface ObjectTargetParams {
  node_path?: string | undefined;
  resource_path?: string | undefined;
  object_id?: number | undefined;
}

export interface ObjectClassResult {
  class: string;
}

export interface ObjectPropertyInfo {
  name: string;
  type: string;
  hint?: number | undefined;
  hint_string?: string | undefined;
  usage?: number | undefined;
}

export interface ObjectPropertyListResult {
  properties: ObjectPropertyInfo[];
}

export interface ObjectMethodArgInfo {
  name: string;
  type: string;
}

export interface ObjectMethodInfo {
  name: string;
  return_type?: string | undefined;
  args?: ObjectMethodArgInfo[] | undefined;
}

export interface ObjectMethodListResult {
  methods: ObjectMethodInfo[];
}

export interface ObjectSignalInfo {
  name: string;
  args?: ObjectMethodArgInfo[] | undefined;
}

export interface ObjectSignalListResult {
  signals: ObjectSignalInfo[];
}

export interface ObjectGetResult {
  property: string;
  value: unknown;
}

export interface ObjectSetResult {
  property: string;
  previous_value?: unknown;
  new_value?: unknown;
}

export interface ObjectCallResult {
  result: unknown;
}

export interface SceneCreateResult {
  path: string;
  root_name: string;
  root_type: string;
}

export interface SceneOpenResult {
  path: string;
  root_name: string;
  root_type: string;
}

export interface SceneSaveResult {
  path: string;
  saved: boolean;
}

export interface SceneReloadResult {
  path: string;
  reloaded: boolean;
}

export interface SceneInstantiateResult {
  name: string;
  type: string;
  path: string;
  scene_file_path: string;
}

export interface SceneGetRootResult {
  name: string;
  type: string;
  path: string;
  scene_file_path: string | null;
}

export interface NodeCreateResult {
  name: string;
  type: string;
  path: string;
}

export interface NodeDeleteResult {
  path: string;
  deleted: boolean;
}

export interface NodeDuplicateResult {
  name: string;
  type: string;
  path: string;
}

export interface NodeRenameResult {
  old_path: string;
  new_path: string;
  name: string;
}

export interface NodeReparentResult {
  old_path: string;
  new_path: string;
}

export interface NodeMoveResult {
  path: string;
  index: number;
}

export interface NodeInspectResult {
  name: string;
  type: string;
  path: string;
  scene_file_path: string | null;
  script: string | null;
  groups: string[];
  children_count: number;
  properties: Record<string, unknown>;
}

export interface NodeChildItem {
  name: string;
  type: string;
  path: string;
}

export interface NodeListChildrenResult {
  node_path: string;
  children: NodeChildItem[];
}

export interface NodeGetPropertyResult {
  property: string;
  value: unknown;
}

export interface NodeSetPropertyResult {
  property: string;
  previous_value?: unknown;
  new_value?: unknown;
}

export interface NodeGetPropertiesResult {
  properties: Record<string, unknown>;
}

export interface ResourceLoadResult {
  path: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface ResourceInspectResult {
  path: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface ResourceCreateResult {
  path: string;
  type: string;
}

export interface ResourceSetPropertyResult {
  path: string;
  property: string;
  previous_value?: unknown;
  new_value?: unknown;
}

export interface ResourceSaveResult {
  path: string;
  saved: boolean;
}

export interface ResourceDuplicateResult {
  path: string;
  type: string;
}

export interface ScriptCreateResult {
  path: string;
  created: boolean;
}

export interface ScriptAttachResult {
  node_path: string;
  script_path: string;
  attached: boolean;
}

export interface ScriptDetachResult {
  node_path: string;
  detached: boolean;
}

export interface ScriptDiagnosticError {
  line: number;
  column: number;
  message: string;
}

export interface ScriptValidateResult {
  valid: boolean;
  errors: ScriptDiagnosticError[];
}

export interface ScriptInspectResult {
  path: string;
  base_type: string;
  methods: Array<{ name: string; args?: Array<{ name: string; type: string }> | undefined; return_type?: string | undefined }>;
  properties: Array<{ name: string; type: string }>;
  signals: Array<{ name: string; args?: Array<{ name: string; type: string }> | undefined }>;
}

export interface SignalInfoItem {
  name: string;
  args: Array<{ name: string; type: string }>;
}

export interface SignalListResult {
  node_path: string;
  signals: SignalInfoItem[];
}

export interface SignalConnectionInfo {
  signal: string;
  target_path: string;
  method: string;
  flags: number;
}

export interface SignalConnectionsResult {
  node_path: string;
  connections: SignalConnectionInfo[];
}

export interface SignalConnectResult {
  connected: boolean;
  source_node_path: string;
  signal_name: string;
  target_node_path: string;
  target_method: string;
}

export interface SignalDisconnectResult {
  disconnected: boolean;
  source_node_path: string;
  signal_name: string;
  target_node_path: string;
  target_method: string;
}

export interface ProjectSettingGetResult {
  setting: string;
  value: unknown;
}

export interface ProjectSettingSetResult {
  setting: string;
  previous_value?: unknown;
  new_value?: unknown;
  saved: boolean;
}

export interface InputEventInfo {
  type: string;
  keycode?: number | undefined;
  button_index?: number | undefined;
}

export interface InputActionInfo {
  name: string;
  deadzone: number;
  events: InputEventInfo[];
}

export interface InputListResult {
  actions: InputActionInfo[];
}

export interface InputAddActionResult {
  action: string;
  added: boolean;
}

export interface InputRemoveActionResult {
  action: string;
  removed: boolean;
}

export interface EditorActiveSceneResult {
  path: string | null;
  root_name: string | null;
  root_type: string | null;
}

export interface EditorOpenScenesResult {
  scenes: string[];
}

export interface EditorSelectedNodeInfo {
  name: string;
  type: string;
  path: string;
}

export interface EditorSelectedNodesResult {
  nodes: EditorSelectedNodeInfo[];
}

export interface EditorSelectNodeResult {
  node_path: string;
  selected: boolean;
}

export interface EditorChangeSceneResult {
  path: string;
  switched: boolean;
}

export interface EditorUndoRedoResult {
  performed: boolean;
}

export interface EditorFilesystemResult {
  root: Record<string, unknown>;
}

export interface EditorScanFilesystemResult {
  scanned: boolean;
}
