import { BridgeRpcError } from '../bridge/rpc-router.js';
interface Event {
  cursor: number;
  timestamp: string;
  event: string;
  data: Record<string, unknown>;
}
/** Pull subscriptions keep no per-client queue; slow readers receive an explicit gap. */
export class ProjectEvents {
  private entries: Event[] = [];
  private cursor = 0;
  private closed = false;
  private sourceDropped = 0;
  private serverDropped = 0;
  private waiters = new Set<() => void>();
  constructor(
    readonly sessionId: string,
    private readonly capacity = 1000,
  ) {}
  append(event: string, data: Record<string, unknown>): void {
    if (this.closed) return;
    if (Buffer.byteLength(JSON.stringify(data)) > 16384) {this.serverDropped++;return;}
    if (typeof data.dropped === 'number' && Number.isSafeInteger(data.dropped) && data.dropped >= 0)
      this.sourceDropped = Math.max(this.sourceDropped, data.dropped);
    this.entries.push({ cursor: ++this.cursor, timestamp: new Date().toISOString(), event, data });
    if (this.entries.length > this.capacity) this.entries.shift();
    for (const wake of [...this.waiters]) wake();
  }
  async read(after: number, limit: number, waitMs: number) {
    if (!Number.isSafeInteger(after) || after < 0 || after > this.cursor)
      throw new BridgeRpcError('INVALID_CURSOR', 'Cursor is outside this session');
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || waitMs < 0 || waitMs > 30000)
      throw new BridgeRpcError('INVALID_ARGUMENT', 'Invalid event page');
    if (after === this.cursor && !this.closed && waitMs) {
      if (this.waiters.size >= 16)
        throw new BridgeRpcError('BUSY', 'Too many pending event subscriptions');
      await new Promise<void>((resolve) => {
        const wake = () => {
          clearTimeout(timer);
          this.waiters.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, waitMs);
        this.waiters.add(wake);
      });
    }
    const oldest = this.entries[0]?.cursor ?? this.cursor + 1;
    const events = this.entries.filter((e) => e.cursor > after).slice(0, limit);
    return {
      sessionId: this.sessionId,
      events,
      nextCursor: events.at(-1)?.cursor ?? after,
      oldestCursor: oldest,
      dropped: Math.max(0, oldest - after - 1),
      sourceDropped: this.sourceDropped,
      serverDropped:this.serverDropped,
      gap: after < oldest - 1,
      closed: this.closed,
    };
  }
  close() {
    this.closed = true;
    for (const wake of [...this.waiters]) wake();
  }
}
