import type { Client } from '@modelcontextprotocol/client';
import { expect } from 'vitest';
// Explicit test-operator approval, restricted to operations exercised on its own fixture.
export async function confirmFixtureOperation(client: Client, name: 'scene.reload' | 'project.settings.set' | 'resource.save' | 'object.call', args: Record<string, unknown>) {
    client.setRequestHandler('elicitation/create', async (request) => {
        expect(request.params.message).toContain(name);
        return { action: 'accept', content: { confirm: true } };
    });
    return client.callTool({ name, arguments: args });
}
