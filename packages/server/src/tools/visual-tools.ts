import {
  Capture2DParamsSchema,
  Capture3DParamsSchema,
  CapturePayloadSchema,
  GameCapturePayloadSchema,
  type AddonCapabilities,
  type CaptureResult,
} from '@godot-mcp/protocol';
import type { Session } from '../session/session.js';
import { SessionStore } from '../session/session-store.js';
import { ScreenshotStore } from '../visual/screenshot-store.js';
import { BridgeRpcError, type RpcRouter } from '../bridge/rpc-router.js';

interface VisualBridge {
  connected: boolean;
  capabilities: AddonCapabilities | null;
  rpc: Pick<RpcRouter, 'call'>;
}
interface RuntimeCapture {
  request(method: string, params?: Record<string, unknown>, timeout?: number): Promise<any>;
}
export class VisualTools {
  private readonly screenshots: ScreenshotStore;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private pending = 0;
  constructor(
    private readonly session: Session,
    private readonly sessions: SessionStore,
    private readonly bridge: VisualBridge,
    private readonly runtime?: RuntimeCapture,
  ) {
    this.screenshots = new ScreenshotStore(session, sessions);
  }
  capture(
    type: 'editor_2d' | 'editor_3d' | 'game',
    input: unknown,
  ): Promise<{ result: CaptureResult; data: string }> {
    if (this.closed)
      return Promise.reject(new BridgeRpcError('SESSION_CLOSED', 'Session is closing'));
    if (this.pending >= 64)
      return Promise.reject(new BridgeRpcError('BUSY', 'Capture queue is full'));
    this.pending++;
    const result = this.queue.then(async () => {
      if (this.closed) throw new BridgeRpcError('SESSION_CLOSED', 'Session is closing');
      const tool =
        type === 'game'
          ? 'visual.capture_game'
          : type === 'editor_2d'
            ? 'visual.capture_viewport_2d'
            : 'visual.capture_viewport_3d';
      try {
        const params = (
          type !== 'editor_3d' ? Capture2DParamsSchema : Capture3DParamsSchema
        ).safeParse(input);
        if (!params.success)
          throw new BridgeRpcError('INVALID_REQUEST', 'Invalid capture parameters');
        if (!this.bridge.connected)
          throw new BridgeRpcError('EDITOR_NOT_CONNECTED', 'Editor is not connected');
        if (type === 'game') {
          if (!this.runtime)
            throw new BridgeRpcError(
              'CAPABILITY_UNAVAILABLE',
              'Runtime integration is unavailable',
            );
          const game = GameCapturePayloadSchema.parse(await this.runtime.request(tool, {}, 10000));
          const { run_id, ...payload } = game;
          const saved = await this.screenshots.save({
            type,
            payload,
            runId: run_id,
            metadata: Capture2DParamsSchema.parse(input),
          });
          return { result: saved, data: game.png_base64 };
        }
        if (
          !(type === 'editor_2d'
            ? this.bridge.capabilities?.viewport2d
            : this.bridge.capabilities?.viewport3d)
        ) {
          throw new BridgeRpcError('CAPTURE_UNSUPPORTED', 'Editor does not support this capture');
        }
        const rpcParams =
          type === 'editor_2d'
            ? {}
            : { viewport_index: Capture3DParamsSchema.parse(input).viewport_index };
        const payload = CapturePayloadSchema.safeParse(await this.bridge.rpc.call(tool, rpcParams));
        if (!payload.success)
          throw new BridgeRpcError(
            'INVALID_CAPTURE_PAYLOAD',
            'Editor returned invalid capture metadata',
          );
        const metadata = {
          label: params.data.label,
          reason: params.data.reason,
          checkpoint: params.data.checkpoint,
        };
        const saved = await this.screenshots.save({ type, payload: payload.data, metadata });
        return { result: saved, data: payload.data.png_base64 };
      } catch (error) {
        const code = error instanceof BridgeRpcError ? error.code : 'CAPTURE_FAILED';
        // Store controlled text only; never raw provider errors or image payloads.
        await this.sessions
          .update(this.session.id, (m) => ({
            ...m,
            errors: [
              ...m.errors,
              {
                timestamp: new Date().toISOString(),
                tool,
                code,
                message: 'Visual capture did not complete',
              },
            ],
          }))
          .catch(() => {});
        throw error instanceof BridgeRpcError
          ? error
          : new BridgeRpcError(code, 'Visual capture did not complete');
      }
    });
    this.queue = result
      .catch(() => {})
      .finally(() => {
        this.pending--;
      });
    return result;
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.queue;
  }
}
