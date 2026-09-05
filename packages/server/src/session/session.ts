import { randomUUID } from 'node:crypto';

export interface Session {
  id: string;
  projectRoot: string;
  startedAt: string;
  editorConnected: boolean;
  runtimeConnected: boolean;
  godotVersion: string | null;
  addonVersion: string | null;
  protocolVersion: 1;
}

export function createSession(projectRoot: string): Session {
  return {
    id: `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`,
    projectRoot,
    startedAt: new Date().toISOString(),
    editorConnected: false,
    runtimeConnected: false,
    godotVersion: null,
    addonVersion: null,
    protocolVersion: 1
  };
}
