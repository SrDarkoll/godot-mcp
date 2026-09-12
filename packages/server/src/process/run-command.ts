import { spawn } from 'node:child_process';
export async function runCommand(
  executable: string,
  args: string[],
  options: { timeoutMs: number; maxOutputBytes: number },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let stdout = '',
      stderr = '',
      bytes = 0,
      failure: { code: string; message: string } | null = null;
    const stop = (code: string, message: string) => {
      if (failure) return;
      failure = { code, message };
      child.kill();
    };
    const timer = setTimeout(
      () => stop('PROCESS_TIMEOUT', 'Configured executable exceeded its time limit'),
      options.timeoutMs,
    );
    child.stdin.on('error', () => {});
    child.stdin.end();
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const append = (chunk: string, error: boolean) => {
      if (failure) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > options.maxOutputBytes) {
        stop('PROCESS_OUTPUT_LIMIT', 'Configured executable exceeded its output limit');
        return;
      }
      if (error) stderr += chunk;
      else stdout += chunk;
    };
    child.stdout.on('data', (chunk) => append(chunk, false));
    child.stderr.on('data', (chunk) => append(chunk, true));
    child.once('error', () =>
      stop('PROCESS_START_FAILED', 'Unable to start the configured executable'),
    );
    child.once('exit', () => {
      if (failure) {
        child.stdout.destroy();
        child.stderr.destroy();
      }
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failure)
        reject(Object.assign(new Error(failure.message), { code: failure.code, stdout, stderr }));
      else resolve({ code, stdout, stderr });
    });
  });
}
