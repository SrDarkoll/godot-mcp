import { randomUUID } from 'node:crypto';
import { acceptedContent, inputRequired, inputResponse, type CallToolResult, type InputRequiredResult, type McpServer, type ServerContext } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import { toolError } from '../mcp/tool-result.js';
import { approvalArgumentSummary, approvalTargetSummary } from './approval-summary.js';
import type { ToolAssessment, ToolPolicy } from './tool-policy.js';
export type ToolRegistrar = Pick<McpServer, 'registerTool'>;
export interface RiskApprovalState {
    kind: 'risk-approval';
    tool: string;
    fingerprint: string;
    nonce: string;
}
export interface RiskApprovalStateCodec {
    mint(payload: RiskApprovalState, context: ServerContext): Promise<string>;
}
const APPROVAL_KEY = 'riskApproval';
const APPROVAL_SCHEMA = z.object({ confirm: z.boolean() });
function approvalMessage(name: string, args: Record<string, unknown>, assessment: ToolAssessment): string {
    const targets = approvalTargetSummary(assessment.targets);
    return `Approve risky Godot MCP operation '${name}'? Targets: ${targets}. Arguments: ${approvalArgumentSummary(args)}`;
}
function declineError(action: 'decline' | 'cancel' | 'invalid'): BridgeRpcError {
    const reason = action === 'decline' ? 'declined' : action === 'cancel' ? 'cancelled' : 'not explicitly approved';
    return new BridgeRpcError(
        'APPROVAL_DECLINED',
        `Risky operation was ${reason}`,
        {
            executed: false,
            requiresUserApproval: true,
            approvalAction: action,
            suggestedAction: 'Ask the user to approve the operation through the MCP host before retrying.'
        }
    );
}

const APPROVAL_REPLAY_WINDOW_MS = 5 * 60 * 1000;

class ConsumedApprovalStore {
    private readonly used = new Map<string, number>();

    consume(nonce: string): boolean {
        const now = Date.now();
        const cutoff = now - APPROVAL_REPLAY_WINDOW_MS;
        for (const [key, timestamp] of this.used) {
            if (timestamp < cutoff) this.used.delete(key);
        }
        if (this.used.has(nonce)) return false;
        this.used.set(nonce, now);
        return true;
    }
}

export function guardedRegistrar(server: McpServer, policy: ToolPolicy, approvalState: RiskApprovalStateCodec): ToolRegistrar {
    const consumedApprovals = new ConsumedApprovalStore();
    type GuardedToolResult = CallToolResult | InputRequiredResult;
    type GuardedHandler = (args: Record<string, unknown>, context: ServerContext) => GuardedToolResult | Promise<GuardedToolResult>;
    const register = (name: string, config: any, handler: GuardedHandler) => server.registerTool(name, config, async (args: Record<string, unknown>, extra: ServerContext): Promise<GuardedToolResult> => {
        try {
            const assessment = await policy.assess(name, args);
            if (assessment.risk === 'risky') {
                const state = extra.mcpReq.requestState<RiskApprovalState>();
                const response = inputResponse(extra.mcpReq.inputResponses, APPROVAL_KEY);
                const matchingState = state?.kind === 'risk-approval' &&
                    state.tool === name &&
                    state.fingerprint === assessment.fingerprint &&
                    typeof state.nonce === 'string' &&
                    state.nonce.length > 0;
                if (matchingState && response.kind === 'elicit') {
                    if (response.action !== 'accept') {
                        await policy.recordApproval(name, args, assessment, 'approval_declined');
                        return toolError(declineError(response.action));
                    }
                    const accepted = acceptedContent(extra.mcpReq.inputResponses, APPROVAL_KEY, APPROVAL_SCHEMA);
                    if (accepted?.confirm !== true) {
                        await policy.recordApproval(name, args, assessment, 'approval_declined');
                        return toolError(declineError('invalid'));
                    }
                    if (!consumedApprovals.consume(state.nonce)) {
                        await policy.recordApproval(name, args, assessment, 'approval_replayed');
                        return toolError(new BridgeRpcError('APPROVAL_REPLAYED', 'This approval was already consumed'));
                    }
                    await policy.recordApproval(name, args, assessment, 'approval_approved');
                    return await policy.execute(name, args, clean => handler(clean, extra), {
                        approvedFingerprint: state.fingerprint
                    });
                }
                if (state !== undefined && !matchingState) {
                    await policy.recordApproval(name, args, assessment, 'approval_stale');
                }
                else {
                    await policy.recordApproval(name, args, assessment, 'approval_required');
                }
                return inputRequired({
                    inputRequests: {
                        [APPROVAL_KEY]: inputRequired.elicit({
                            message: approvalMessage(name, args, assessment),
                            requestedSchema: {
                                type: 'object',
                                properties: {
                                    confirm: {
                                        type: 'boolean',
                                        title: 'Approve this risky Godot MCP operation'
                                    }
                                },
                                required: ['confirm']
                            }
                        })
                    },
                    requestState: await approvalState.mint({
                        kind: 'risk-approval',
                        tool: name,
                        fingerprint: assessment.fingerprint,
                        nonce: randomUUID()
                    }, extra)
                });
            }
            return await policy.execute(name, args, clean => handler(clean, extra));
        }
        catch (error) {
            return toolError(error);
        }
    });
    return { registerTool: register as McpServer['registerTool'] };
}
