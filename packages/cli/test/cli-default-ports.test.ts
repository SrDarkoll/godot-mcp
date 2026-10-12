import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readDescriptor } from '@godot-mcp/server/management';
import { writeProjectConfig } from '@godot-mcp/server/project-config';
import { expect, it } from 'vitest';

it('runs two independent Godot projects concurrently with the generated default configuration', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-default-ports-'));
  const clients: Client[] = [];
  try {
    const projects = [path.join(root, 'first'), path.join(root, 'second')];
    const ports: number[] = [];
    for (const project of projects) {
      await fs.mkdir(project); await fs.writeFile(path.join(project, 'project.godot'), '[application]\nconfig/name="Default port test"\n');
      const config = await writeProjectConfig(project, { toolProfile: 'minimal' });
      expect(config.bridgePort).toBe(0);
      const client = new Client({ name: 'default-port-regression', version: '1' });
      clients.push(client);
      await client.connect(new StdioClientTransport({ command: process.execPath,
        args: [fileURLToPath(new URL('../dist/index.js', import.meta.url)), 'start', project],
        env: { ...process.env, GODOT_MCP_UPDATE_CHECK: '0' } as Record<string, string>, stderr: 'pipe' }));
      expect((await client.callTool({ name: 'session.status', arguments: {} })).isError).not.toBe(true);
      ports.push((await readDescriptor(project))!.port);
    }
    expect(ports.every(port => port > 0)).toBe(true);
    expect(new Set(ports).size).toBe(2);
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await fs.rm(root, { recursive: true, force: true });
  }
});
