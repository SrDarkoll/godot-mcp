import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { managedCodexLaunchMatches, prepareCodexUpgrade, applyCodexUpgrade } from '../src/setup/codex-upgrade.js';
import { makeClientLaunchEntry } from '../src/setup/client-config.js';

it('verifies a source launcher for readiness while still requiring consent to replace it during upgrade', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-source-ready-'));
  const server = fileURLToPath(new URL('../../server/dist/index.js', import.meta.url));
  const args = [server, '--project', root, '--tool-profile', 'full'];
  const text = `[mcp_servers.godot-mcp]\ncommand=${JSON.stringify(process.execPath)}\nargs=${JSON.stringify(args)}\n`;
  try {
    expect(await managedCodexLaunchMatches(text, makeClientLaunchEntry(root, 'full'))).toBe(true);
    expect(await managedCodexLaunchMatches(text, makeClientLaunchEntry(root, 'minimal'))).toBe(false);
    const file = path.join(root, 'config.toml'); await fs.writeFile(file, text);
    const plan = await prepareCodexUpgrade(file, makeClientLaunchEntry(root, 'full'));
    expect(plan.launcherReplacement?.kind).toBe('source_checkout');
    await expect(applyCodexUpgrade(plan)).rejects.toMatchObject({ code: 'LAUNCHER_REPLACEMENT_REQUIRED' });
    expect(await fs.readFile(file, 'utf8')).toBe(text);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
