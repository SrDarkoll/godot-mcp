import { access } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const godotBin = process.env.GODOT_BIN;
const visual = process.argv.includes('--visual');
const runtime = process.argv.includes('--runtime');
const debuggerGate = process.argv.includes('--debugger');
const headless = process.argv.includes('--headless');
const required = visual || runtime || debuggerGate || headless || process.env.REQUIRE_GODOT_INTEGRATION === '1';
if((runtime||debuggerGate) && (process.platform!=='win32'||process.env.GODOT_RUNTIME_INTEGRATION!=='1')){
  console.error('Runtime integration requires Windows and GODOT_RUNTIME_INTEGRATION=1');process.exit(1);
}
if (visual && (process.platform !== 'win32' || process.env.GODOT_VISUAL_INTEGRATION !== '1')) {
  console.error('Visual integration requires Windows and GODOT_VISUAL_INTEGRATION=1');
  process.exit(1);
}

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

const vitestEntry = path.resolve('node_modules', 'vitest', 'vitest.mjs');
try {
  await access(vitestEntry);
} catch {
  console.error('Integration failed: Vitest is not installed. Run npm install first.');
  process.exit(1);
}

const selection = debuggerGate ? ['tests/integration/runtime-debugger-advanced.test.ts'] : headless ? ['tests/integration/headless-process-manager.test.ts'] : runtime ? ['tests/integration/runtime-debugger.test.ts','tests/integration/runtime-game-capture.test.ts','tests/integration/workflow-run-check.test.ts'] : visual ? ['tests/integration/visual-capture.test.ts'] :
  ['tests/integration', '--exclude', 'tests/integration/visual-capture.test.ts','--exclude','tests/integration/runtime-debugger.test.ts','--exclude','tests/integration/runtime-debugger-advanced.test.ts','--exclude','tests/integration/runtime-game-capture.test.ts','--exclude','tests/integration/workflow-run-check.test.ts'];
const result = spawnSync(process.execPath, [vitestEntry, 'run', ...selection, '--maxWorkers=1', '--no-file-parallelism'], {
  stdio: 'inherit',
  env: { ...process.env, GODOT_BIN: godotBin },
  windowsHide: true
});
if (result.error) {
  console.error(`Integration failed: unable to launch Vitest: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
