import { Capture2DParamsSchema, Capture3DParamsSchema, CaptureResolveInputSchema, GameCaptureParamsSchema } from '@godot-mcp/protocol';
import * as z from 'zod/v4';
import type { SessionStore } from '../session/session-store.js';
import type { Session } from '../session/session.js';
import { getSessionManifest } from '../tools/session-manifest.js';
import type { VisualTools } from '../tools/visual-tools.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { toolError, toolImageSuccess, toolSuccess } from './tool-result.js';
import { CaptureResolver } from '../visual/capture-resolver.js';
export function registerVisualTools(registrar: ToolRegistrar, visual: VisualTools, sessions: SessionStore, session: Session): void {
    const resolver = new CaptureResolver(sessions);
    registrar.registerTool('visual.resolve_capture', {
        description: 'Resolve a retained capture reference after reconnect and verify its manifest, file and SHA-256 before returning its absolute path.',
        inputSchema: CaptureResolveInputSchema
    }, async (args) => {
        try { return toolSuccess(await resolver.resolve(args.capture_ref)); }
        catch (error) { return toolError(error); }
    });
    registrar.registerTool('visual.capture_game', { description: 'Capture the owned graphical game runtime to a persistent PNG, optionally with temporary center and zoom that never saves the scene.', inputSchema: GameCaptureParamsSchema }, async (args) => {
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
