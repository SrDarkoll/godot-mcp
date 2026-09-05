import { acceptedContent, inputRequired, inputResponse, type McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import { toolError } from '../mcp/tool-result.js';
import type { ToolAssessment, ToolPolicy } from './tool-policy.js';
export type ToolRegistrar = Pick<McpServer, 'registerTool'>;
export interface RiskApprovalState {
    kind: 'risk-approval';
    tool: string;
    fingerprint: string;
}
export interface RiskApprovalStateCodec {
    mint(payload: RiskApprovalState): Promise<string>;
}
const APPROVAL_KEY = 'riskApproval';
const APPROVAL_SCHEMA = z.object({ confirm: z.boolean() });
function approvalMessage(name: string, assessment: ToolAssessment): string {
    const targets = assessment.targets.length ? assessment.targets.join(', ') : 'no explicit target';
    return `Approve risky Godot MCP operation '${name}'? Targets: ${targets}`;
}
function declineError(action: 'decline' | 'cancel' | 'invalid'): BridgeRpcError {
    return new BridgeRpcError('APPROVAL_DECLINED', `Risky operation was ${action === 'invalid' ? 'not explicitly approved' : action + 'd'}`);
}
export function guardedRegistrar(server: McpServer, policy: ToolPolicy, approvalState: RiskApprovalStateCodec): ToolRegistrar {
    const register = (name: string, config: any, handler: any) => server.registerTool(name, config, async (args: Record<string, unknown>, extra: any) => {
        try {
            const assessment = await policy.assess(name, args);
            if (assessment.risk === 'risky') {
                const state = extra.mcpReq.requestState<RiskApprovalState>();
                const response = inputResponse(extra.mcpReq.inputResponses, APPROVAL_KEY);
                const matchingState = state?.kind === 'risk-approval' &&
                    state.tool === name &&
                    state.fingerprint === assessment.fingerprint;
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
                            message: approvalMessage(name, assessment),
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
                    requestState: await approvalState.mint({ kind: 'risk-approval', tool: name, fingerprint: assessment.fingerprint })
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
