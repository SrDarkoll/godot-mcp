import type { SessionStatusResult } from '@godot-mcp/protocol';
import type { Session } from '../session/session.js';

export function getSessionStatus(session: Session): SessionStatusResult {
  return {
    sessionId: session.id,
    projectRoot: session.projectRoot,
    editorConnected: session.editorConnected,
    runtimeConnected: session.runtimeConnected,
    godotVersion: session.godotVersion,
    addonVersion: session.addonVersion,
    protocolVersion: 1
  };
}
