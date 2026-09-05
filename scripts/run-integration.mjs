import { access } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const godotBin = process.env.GODOT_BIN;
const required = process.env.REQUIRE_GODOT_INTEGRATION === '1';

if (!godotBin) {
  const message = 'SKIP integration: GODOT_BIN is not configured';
  if (required) {
    console.error(`${message} (REQUIRE_GODOT_INTEGRATION=1)`);
    process.exit(1);
  }
  console.log(message);
  process.exit(0);
}

try {
  await access(godotBin);
} catch {
  console.error(`Integration failed: GODOT_BIN does not exist: ${godotBin}`);
  process.exit(1);
}

const version = spawnSync(godotBin, ['--version'], {
  encoding: 'utf8',
  windowsHide: true
});
if (version.error) {
  console.error(`Integration failed: unable to execute GODOT_BIN: ${version.error.message}`);
  process.exit(1);
}
if (version.status !== 0) {
  console.error(`Integration failed: Godot --version exited with code ${version.status}`);
  if (version.stderr) process.stderr.write(version.stderr);
  process.exit(1);
}

const versionText = `${version.stdout ?? ''}${version.stderr ?? ''}`.trim();
if (!/^4(?:\.|$)/.test(versionText)) {
  console.error(`Integration failed: Godot 4.x is required, got: ${versionText || '<empty version>'}`);
  process.exit(1);
}

const vitestBin = path.resolve(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vitest.cmd' : 'vitest'
);
try {
  await access(vitestBin);
} catch {
  console.error('Integration failed: Vitest is not installed. Run npm install first.');
  process.exit(1);
}

const result = spawnSync(vitestBin, ['run', 'tests/integration/editor-handshake.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, GODOT_BIN: godotBin },
  windowsHide: true
});
if (result.error) {
  console.error(`Integration failed: unable to launch Vitest: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
