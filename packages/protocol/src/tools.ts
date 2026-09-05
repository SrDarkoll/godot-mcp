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
