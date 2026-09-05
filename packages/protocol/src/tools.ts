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
