import type { SessionStore } from '../session/session-store.js';
export async function getSessionManifest(sessions: SessionStore, sessionId: string) {
  return { manifest: await sessions.read(sessionId) };
}
