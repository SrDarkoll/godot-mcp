interface ToolStats {
  count: number;
  failures: number;
  totalMs: number;
  queueMs: number;
  maxMs: number;
  samples: number[];
}
export class SessionTelemetry {
  private readonly started = performance.now();
  private readonly tools = new Map<string, ToolStats>();
  private connected = false;
  private disconnects = 0;
  record(name: string, elapsedMs: number, queueMs: number, success: boolean): void {
    const key = this.tools.has(name) || this.tools.size < 256 ? name : 'other';
    const stats = this.tools.get(key) ?? {
      count: 0,
      failures: 0,
      totalMs: 0,
      queueMs: 0,
      maxMs: 0,
      samples: [],
    };
    stats.count++;
    if (!success) stats.failures++;
    stats.totalMs += elapsedMs;
    stats.queueMs += queueMs;
    stats.maxMs = Math.max(stats.maxMs, elapsedMs);
    stats.samples.push(elapsedMs);
    if (stats.samples.length > 128) stats.samples.shift();
    this.tools.set(key, stats);
  }
  connectionChanged(connected: boolean): void {
    if (this.connected && !connected) this.disconnects++;
    this.connected = connected;
  }
  snapshot() {
    const tools = Object.fromEntries(
      [...this.tools].map(([name, stats]) => {
        const sorted = [...stats.samples].sort((a, b) => a - b);
        const percentile = (p: number) =>
          sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
        return [
          name,
          {
            count: stats.count,
            failures: stats.failures,
            meanMs: stats.totalMs / stats.count,
            meanQueueMs: stats.queueMs / stats.count,
            maxMs: stats.maxMs,
            p50Ms: percentile(0.5),
            p95Ms: percentile(0.95),
            sampleSize: sorted.length,
          },
        ];
      }),
    );
    return {
      uptimeMs: performance.now() - this.started,
      editorConnected: this.connected,
      disconnects: this.disconnects,
      memory: process.memoryUsage(),
      tools,
    };
  }
}
