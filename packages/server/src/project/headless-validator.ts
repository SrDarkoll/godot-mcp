import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import * as z from 'zod/v4';
import type { Session } from '../session/session.js';
import type { SessionStore } from '../session/session-store.js';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import { runCommand } from '../process/run-command.js';
import { readProjectConfig } from './project-config.js';
import { snapshotProject, fileHash } from './project-snapshot.js';
import { VALIDATION_SCRIPT } from './validation-script.js';

export interface ValidationOptions {
  paths: string[];
  timeout_ms: number;
  max_project_bytes: number;
}
interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path: string | null;
  line: number | null;
}
const supported = /\.(gd|tscn|tres|json)$/i;
function logDiagnostics(output: string, phase: string): Diagnostic[] {
  const lines = output.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
  const results: Diagnostic[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^(SCRIPT ERROR|ERROR|WARNING):\s*(.*)$/);
    if (!match) continue;
    const location = lines
      .slice(i + 1, i + 4)
      .map((line) => line.match(/\((res:\/\/.*):(\d+)\)/))
      .find(Boolean);
    results.push({
      severity: match[1] === 'WARNING' ? 'warning' : 'error',
      code: phase + '_DIAGNOSTIC',
      message: match[2]!.slice(0, 1500),
      path: location?.[1] ?? null,
      line: location ? Number(location[2]) : null,
    });
  }
  return results;
}
function withoutBridge(config: string): string {
  return config.replace(/(\[editor_plugins\][\s\S]*?)(?=\r?\n\[|$)/g, (section) =>
    section.replace(
      /"res:\/\/addons\/godot_mcp\/plugin\.cfg"\s*,\s*|,\s*"res:\/\/addons\/godot_mcp\/plugin\.cfg"|"res:\/\/addons\/godot_mcp\/plugin\.cfg"/gi,
      '',
    ),
  );
}
const NativeReport = z.object({
  files: z.array(z.object({ path: z.string(), valid: z.boolean(), message: z.string() })).max(512),
  valid: z.boolean(),
});

/** Validation runs in a retained project copy; project code remains trusted, not sandboxed. */
export class HeadlessValidator {
  constructor(
    private readonly session: Session,
    private readonly sessions: SessionStore,
  ) {}
  async validate(options: ValidationOptions) {
    const config = await readProjectConfig(this.session.projectRoot);
    const executable = config.godotBin ?? process.env.GODOT_BIN;
    if (!executable)
      throw new BridgeRpcError(
        'GODOT_NOT_CONFIGURED',
        'Configure Godot with the CLI before headless validation',
      );
    const id = randomUUID(),
      artifactPath = await this.sessions.ensureDirectory(
        this.session.id,
        `artifacts/validation-${id}`,
      );
    const copy = await this.sessions.ensureDirectory(
      this.session.id,
      `artifacts/validation-${id}/project`,
    );
    const deadline = Date.now() + options.timeout_ms,
      started = Date.now();
    const diagnostics: Diagnostic[] = [];
    const files: Array<{ path: string; valid: boolean; message: string }> = [];
    let complete = false,
      godotVersion: string | null = null,
      snapshotFiles = 0,
      snapshotBytes = 0;
    const phase = async (name: string, args: string[], limit = 2 * 1024 * 1024) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        throw Object.assign(new Error('Validation deadline exceeded'), { code: 'PROCESS_TIMEOUT' });
      try {
        const result = await runCommand(executable, args, {
          timeoutMs: remaining,
          maxOutputBytes: limit,
        });
        await fs.writeFile(path.join(artifactPath, name + '.log'), result.stdout + result.stderr);
        diagnostics.push(...logDiagnostics(result.stdout + result.stderr, name.toUpperCase()));
        return result;
      } catch (error) {
        const data = error as { stdout?: string; stderr?: string };
        await fs.writeFile(
          path.join(artifactPath, name + '.log'),
          (data.stdout ?? '') + (data.stderr ?? ''),
        );
        throw error;
      }
    };
    try {
      const version = await phase('version', ['--version'], 64 * 1024);
      godotVersion = (version.stdout + version.stderr).trim();
      if (version.code !== 0 || !/^4\./.test(godotVersion))
        throw new BridgeRpcError(
          'GODOT_VERSION_UNSUPPORTED',
          'Headless validation requires Godot 4',
        );
      const snapshot = await snapshotProject(
        this.session.projectRoot,
        copy,
        options.max_project_bytes,
        deadline,
      );
      snapshotFiles = snapshot.files.length;
      snapshotBytes = snapshot.bytes;
      const sourceConfig = await fs.readFile(path.join(copy, 'project.godot'), 'utf8');
      const stagedConfig = withoutBridge(sourceConfig);
      await fs.writeFile(path.join(copy, 'project.godot'), stagedConfig);
      await fs.writeFile(path.join(artifactPath, 'source-project.godot'), sourceConfig);
      await fs.writeFile(
        path.join(artifactPath, 'snapshot.json'),
        JSON.stringify(
          {
            ...snapshot,
            bridgeDisabled: true,
            stagedConfigHash: createHash('sha256').update(stagedConfig).digest('hex'),
          },
          null,
          2,
        ),
      );
      const selected = options.paths.length
        ? [...new Set(options.paths)]
        : snapshot.files.filter((file) => supported.test(file.path)).map((file) => file.path);
      if (selected.length > 512)
        throw new BridgeRpcError(
          'VALIDATION_LIMIT',
          'More than 512 validation targets; select paths explicitly',
        );
      const unvalidated = options.paths.length
        ? selected.filter((p) => !supported.test(p))
        : snapshot.files
            .filter((f) => /\.(cs|gdshader|shader|gdextension)$/i.test(f.path))
            .map((f) => f.path);
      for (const file of unvalidated)
        diagnostics.push({
          severity: 'warning',
          code: 'UNVALIDATED_TYPE',
          message: 'This headless worker does not prove validity for this type',
          path: file,
          line: null,
        });
      const targets = selected.filter((p) => supported.test(p));
      const imported = await phase('import', [
        '--headless',
        '--path',
        copy,
        '--editor',
        '--import',
        '--quit',
      ]);
      if (imported.code !== 0)
        diagnostics.push({
          severity: 'error',
          code: 'IMPORT_EXIT',
          message: `Godot import exited with ${imported.code}`,
          path: null,
          line: null,
        });
      const worker = path.join(artifactPath, 'validator.gd'),
        request = path.join(artifactPath, 'request.json'),
        nativeOutput = path.join(artifactPath, 'native-report.json');
      await fs.writeFile(worker, VALIDATION_SCRIPT);
      await fs.writeFile(request, JSON.stringify({ paths: targets, report: nativeOutput }));
      const checked = await phase('validation', [
        '--headless',
        '--path',
        copy,
        '--script',
        worker,
        '--',
        request,
      ]);
      const nativeStat = await fs.lstat(nativeOutput);
      if (!nativeStat.isFile() || nativeStat.isSymbolicLink() || nativeStat.size > 2 * 1024 * 1024)
        throw new BridgeRpcError(
          'VALIDATION_REPORT_INVALID',
          'Native validation report is unavailable or oversized',
        );
      const native = NativeReport.parse(JSON.parse(await fs.readFile(nativeOutput, 'utf8')));
      if (
        native.files.length !== targets.length ||
        new Set(native.files.map((f) => f.path)).size !== targets.length ||
        native.files.some((f) => !targets.includes(f.path))
      )
        throw new BridgeRpcError(
          'VALIDATION_REPORT_INVALID',
          'Native report does not cover requested files',
        );
      files.push(...native.files);
      for (const result of native.files)
        if (!result.valid)
          diagnostics.push({
            severity: 'error',
            code: 'FILE_INVALID',
            message: result.message,
            path: result.path,
            line: null,
          });
      complete = (checked.code === 0 || checked.code === 1) && unvalidated.length === 0;
      if (checked.code !== 0 && checked.code !== 1)
        diagnostics.push({
          severity: 'error',
          code: 'VALIDATION_EXIT',
          message: `Godot validator exited with ${checked.code}`,
          path: null,
          line: null,
        });
      const targetKeys=new Set(targets.map(value=>value.toLowerCase()));
      for (const file of snapshot.files.filter((f) => targetKeys.has(f.path.toLowerCase()))) {
        if ((await fileHash(path.join(copy, file.path.slice(6)))) !== file.sha256) {
          complete = false;
          diagnostics.push({
            severity: 'error',
            code: 'SNAPSHOT_MODIFIED',
            message: 'Import or project code changed a validation target',
            path: file.path,
            line: null,
          });
        }
      }
    } catch (error) {
      complete = false;
      diagnostics.push({
        severity: 'error',
        code:
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : 'VALIDATION_FAILED',
        message: (error instanceof Error ? error.message : 'Validation failed').slice(0, 1500),
        path: null,
        line: null,
      });
    }
    const truncated = diagnostics.length > 200;
    const report = {
      id,
      sessionId: this.session.id,
      scope: options.paths.length ? 'selected files plus project import' : 'project',
      valid:
        complete &&
        !truncated &&
        !diagnostics.some((d) => d.severity === 'error') &&
        files.every((f) => f.valid),
      complete: complete && !truncated,
      godotVersion,
      durationMs: Date.now() - started,
      snapshotFiles,
      snapshotBytes,
      artifactPath,
      projectCodeSandboxed: false,
      files,
      diagnostics: diagnostics.slice(0, 200),
      diagnosticsTruncated: truncated,
    };
    await fs.writeFile(path.join(artifactPath, 'report.json'), JSON.stringify(report, null, 2));
    return report;
  }
}
