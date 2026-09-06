import { randomBytes } from 'node:crypto';
import { SERVER_VERSION } from '@godot-mcp/protocol';
import { createRequestStateCodec, McpServer } from '@modelcontextprotocol/server';
import type { BridgeServer } from '../bridge/bridge-server.js';
import { RecoveryService } from '../recovery/recovery-service.js';
import { RuntimeService } from '../runtime/runtime-service.js';
import { approvalStateBinding } from '../security/approval-state.js';
import { ToolPolicy } from '../security/tool-policy.js';
import { guardedRegistrar } from '../security/tool-registrar.js';
import type { SessionStore } from '../session/session-store.js';
import type { Session } from '../session/session.js';
import { registerDebugTools } from '../tools/debug-tools.js';
import { registerRecoveryTools } from '../tools/recovery-tools.js';
import { registerRuntimeTools } from '../tools/runtime-tools.js';
import { registerSecurityTools } from '../tools/security-tools.js';
import { VisualTools } from '../tools/visual-tools.js';
import { WorkflowService } from '../workflow/workflow-service.js';
import { registerAnimationTools } from './register-animation-tools.js';
import { registerCoreTools } from './register-core-tools.js';
import { registerEditorTools } from './register-editor-tools.js';
import { registerNodeTools } from './register-node-tools.js';
import { registerObjectTools } from './register-object-tools.js';
import { registerProjectTools } from './register-project-tools.js';
import { registerPower2dTools } from './register-power2d-tools.js';
import { registerPower3dTools } from './register-power3d-tools.js';
import { registerMaterial3dTools } from './register-material3d-tools.js';
import { registerNavigationTools } from './register-navigation-tools.js';
import { registerResourceTools } from './register-resource-tools.js';
import { registerSceneTools } from './register-scene-tools.js';
import { registerScriptTools } from './register-script-tools.js';
import { registerSignalTools } from './register-signal-tools.js';
import { registerTilemapTools } from './register-tilemap-tools.js';
import { registerTilesetTools } from './register-tileset-tools.js';
import { registerUiTools } from './register-ui-tools.js';
import { registerVisualTools } from './register-visual-tools.js';
import { registerWorkflowTools } from './register-workflow-tools.js';
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
    const approvalState = createRequestStateCodec<{
        kind: 'risk-approval';
        tool: string;
        fingerprint: string;
        nonce: string;
    }>({
        key: randomBytes(32),
        ttlSeconds: 300,
        bind: requestContext => approvalStateBinding(ctx.session.id, requestContext)
    });
    const server = new McpServer({ name: 'godot-mcp', version: SERVER_VERSION }, { requestState: { verify: approvalState.verify } });
    const recovery = ctx.recovery ?? new RecoveryService(ctx.session, ctx.sessions, ctx.bridge);
    const policy = ctx.policy ?? new ToolPolicy(ctx.session, ctx.sessions, recovery);
    const runtime = ctx.runtime ?? new RuntimeService(ctx.session, ctx.sessions, ctx.bridge);
    const visual = ctx.visual ?? new VisualTools(ctx.session, ctx.sessions, ctx.bridge, runtime);
    const workflow = new WorkflowService(ctx.session, ctx.sessions, ctx.bridge, runtime, visual);
    const registrar = guardedRegistrar(server, policy, approvalState);
    const rpc = ctx.bridge.rpc;
    registerRuntimeTools(registrar, runtime);
    registerDebugTools(registrar, runtime);
    registerRecoveryTools(registrar, recovery, rpc);
    registerSecurityTools(registrar, policy);
    registerVisualTools(registrar, visual, ctx.sessions, ctx.session);
    registerWorkflowTools(registrar, workflow);
    registerCoreTools(registrar, ctx.bridge, ctx.session);
    registerUiTools(registrar, rpc);
    registerAnimationTools(registrar, rpc);
    registerTilemapTools(registrar, rpc);
    registerTilesetTools(registrar, rpc);
    registerPower2dTools(registrar, rpc);
    registerPower3dTools(registrar, rpc);
    registerMaterial3dTools(registrar, rpc);
    registerNavigationTools(registrar, rpc);
    registerObjectTools(registrar, rpc);
    registerSceneTools(registrar, rpc);
    registerNodeTools(registrar, rpc);
    registerResourceTools(registrar, rpc);
    registerScriptTools(registrar, rpc);
    registerSignalTools(registrar, rpc);
    registerProjectTools(registrar, rpc);
    registerEditorTools(registrar, rpc);
    return server;
}
