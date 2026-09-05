import { Capture2DParamsSchema, Capture3DParamsSchema } from '@godot-mcp/protocol';
import * as z from 'zod/v4';
import type { SessionStore } from '../session/session-store.js';
import type { Session } from '../session/session.js';
import { getSessionManifest } from '../tools/session-manifest.js';
import type { VisualTools } from '../tools/visual-tools.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { toolError, toolImageSuccess, toolSuccess } from './tool-result.js';
export function registerVisualTools(registrar: ToolRegistrar, visual: VisualTools, sessions: SessionStore, session: Session): void {
    registrar.registerTool('visual.capture_game', { description: 'Capture the running game viewport to a persistent PNG; requires an owned graphical runtime.', inputSchema: Capture2DParamsSchema }, async (args) => {
        try {
            const capture = await visual.capture('game', args);
            return toolImageSuccess(capture.result, capture.data);
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('session.manifest', {
        description: 'Read the persistent manifest of the current session, including screenshots and visual checkpoints.',
        inputSchema: z.strictObject({})
    }, async () => {
        try {
            return toolSuccess(await getSessionManifest(sessions, session.id));
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('visual.capture_viewport_2d', {
        description: 'Activate the 2D editor tab and capture its viewport as a persistent PNG. Requires a graphical editor.',
        inputSchema: Capture2DParamsSchema
    }, async (args) => {
        try {
            const capture = await visual.capture('editor_2d', args);
            return toolImageSuccess(capture.result, capture.data);
        }
        catch (error) {
            return toolError(error);
        }
    });
    registrar.registerTool('visual.capture_viewport_3d', {
        description: 'Activate the 3D editor tab and capture the requested visible viewport (0-3) as a persistent PNG.',
        inputSchema: Capture3DParamsSchema
    }, async (args) => {
        try {
            const capture = await visual.capture('editor_3d', args);
            return toolImageSuccess(capture.result, capture.data);
        }
        catch (error) {
            return toolError(error);
        }
    });
}
