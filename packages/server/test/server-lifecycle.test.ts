import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

async function exists(file: string): Promise<boolean> {
  try { await stat(file); return true; } catch { return false; }
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return await predicate();
}

it('removes the ephemeral bridge descriptor when MCP stdin closes', async () => {
  const parent=path.resolve(import.meta.dirname,'../../../.godot-mcp/cli-test-runs');await mkdir(parent,{recursive:true});
  const root = await mkdtemp(path.join(parent, 'server-lifecycle-'));
  await writeFile(path.join(root, 'project.godot'), '[application]\nconfig/name="Lifecycle"\n');
  const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
  const descriptor = path.join(root, '.godot-mcp', 'runtime', 'bridge.json');
  const child = spawn(process.execPath, [entry, '--project', root, '--bridge-port', '0'], {
    stdio: ['pipe', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });

  try {
    expect(await waitFor(() => exists(descriptor), 2_000)).toBe(true);
    const persisted = JSON.parse(await readFile(descriptor, 'utf8')) as { host: string };
    expect(persisted.host).toBe('127.0.0.1');

    child.stdin.end();
    const exited = await waitFor(async () => child.exitCode !== null || child.signalCode !== null, 2_000);
    expect(exited, `server did not exit after stdin EOF; stderr=${stderr}`).toBe(true);
    expect(await exists(descriptor)).toBe(false);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}, 8_000);
