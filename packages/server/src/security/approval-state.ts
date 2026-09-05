import type { ServerContext } from '@modelcontextprotocol/server';

export function approvalStateBinding(sessionId: string, context: ServerContext): string {
  return `${sessionId}\0${context.mcpReq.method}\0${context.http?.authInfo?.clientId ?? 'stdio'}`;
}
